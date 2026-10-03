import { sql } from './db';
import {
  Product,
  Category,
  Customer,
  OrderRow,
  OrderItemRow,
  OrderWithRelations,
  CartItem,
  Expense,
  PaymentMode,
  AdvanceOrderRow,
  AdvanceOrderItemRow,
  AdvanceOrderStatus,
  AdvanceOrderWithRelations,
  ItemType,
} from './types';

// Reset per process so the idempotent column checks only run once.
let productSchemaChecked = false;
let customerSchemaChecked = false;
let advanceSchemaChecked = false;

/** Add the bill-adjustment columns (discount, GST, delivery) to advance_orders. */
async function ensureAdvanceSchema(): Promise<void> {
  if (advanceSchemaChecked) return;
  try {
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'FIXED'`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS is_gst BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_order_items ADD COLUMN IF NOT EXISTS offer_pct NUMERIC NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE advance_order_items ADD COLUMN IF NOT EXISTS original_price NUMERIC`;
    advanceSchemaChecked = true;
  } catch (err) {
    console.error('Failed to ensure advance order schema:', err);
  }
}

// Utility to generate a unique ID
const uid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * `upsertCustomer` relies on `ON CONFLICT (phone)`, which Postgres only accepts
 * when a UNIQUE constraint exists on that column. schema.sql originally created a
 * plain (non-unique) index, so every sale that involved a customer phone failed
 * with "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification". This promotes the index to UNIQUE and is idempotent.
 */
/**
 * Only keep product links that still exist in the catalogue. A stale id (a
 * product deleted in another tab, or removed by the demo-data rollback) would
 * violate the *_product_id foreign key and abort the entire save. The line still
 * bills correctly from its snapshot name/price — it simply loses the catalogue
 * link, which is exactly what ON DELETE SET NULL does anyway.
 */
async function filterLiveProductIds(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  const live = new Set<string>();
  if (wanted.length === 0) return live;
  const existing = await sql`SELECT id FROM products WHERE id = ANY(${wanted})`;
  for (const row of existing as unknown as { id: string }[]) {
    live.add(row.id);
  }
  return live;
}

/**
 * Map typed-in line names (no catalogue pick) to a product id when exactly one
 * catalogue product carries that name, so its stock still moves on sale.
 * Ambiguous or unknown names stay unlinked.
 */
async function matchProductIdsByName(names: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const matches = new Map<string, string>();
  if (wanted.length === 0) return matches;
  const rows = await sql`
    SELECT lower(trim(name)) AS key, min(id::text) AS id
    FROM products
    WHERE lower(trim(name)) = ANY(${wanted})
    GROUP BY lower(trim(name))
    HAVING count(*) = 1
  `;
  for (const row of rows as unknown as { key: string; id: string }[]) {
    matches.set(row.key, row.id);
  }
  return matches;
}

async function ensureCustomerSchema(): Promise<void> {
  if (customerSchemaChecked) return;
  try {
    // If any historical duplicates exist, collapse them onto the oldest row
    // before the UNIQUE index can be created.
    await sql`
      DELETE FROM customers c
      USING customers d
      WHERE c.phone = d.phone
        AND c.id > d.id
    `;
    await sql`DROP INDEX IF EXISTS idx_customers_phone`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)`;
    customerSchemaChecked = true;
  } catch (err) {
    console.error('Failed to ensure customer schema:', err);
  }
}

/**
 * The bill an advance order settles into: its item subtotal, the discount /
 * GST / delivery recorded at booking, plus an extra rupee discount taken off
 * the balance at collection. The extra discount is converted to a pre-GST
 * amount so the customer pays exactly that much less.
 */
export function advanceBill(
  advance: AdvanceOrderWithRelations,
  extraDiscountOnBalance = 0,
) {
  const subtotal = advance.items.reduce(
    (acc, it) => acc + Number(it.snapshot_price) * Number(it.quantity),
    0,
  );
  let bookedDiscount = Number(advance.discount_amount) || 0;
  const isGst = Boolean(advance.is_gst) && Number(advance.gst_percentage) > 0;
  const gstPercentage = isGst ? Number(advance.gst_percentage) : 0;
  const deliveryFee = Number(advance.delivery_fee) || 0;
  // Advances booked before these columns existed only kept the total; any gap
  // below the item subtotal was the bill discount.
  if (!bookedDiscount && !isGst && !deliveryFee) {
    bookedDiscount = Math.max(0, subtotal - (Number(advance.total_amount) || 0));
  }
  const extraDiscount = Math.max(0, extraDiscountOnBalance) / (1 + gstPercentage / 100);
  return {
    subtotal,
    isGst,
    gstPercentage,
    deliveryFee,
    discountType: advance.discount_type === 'PERCENT' ? ('PERCENT' as const) : ('FIXED' as const),
    discountValue: Number(advance.discount_value) || 0,
    extraDiscount,
    discountAmount: Math.round((bookedDiscount + extraDiscount) * 100) / 100,
  };
}

export const dbStore = {
  // CATEGORIES
  async listCategories(): Promise<Category[]> {
    const rows = await sql`SELECT * FROM categories ORDER BY name ASC`;
    return rows as Category[];
  },

  async addCategory(name: string): Promise<Category> {
    const id = uid();
    const rows = await sql`
      INSERT INTO categories (id, name)
      VALUES (${id}, ${name})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `;
    return rows[0] as Category;
  },

  async updateCategory(id: string, name: string): Promise<Category | null> {
    const existing = await sql`SELECT * FROM categories WHERE id = ${id}`;
    if (existing.length === 0) return null;
    const oldName = (existing[0] as Category).name;
    const newName = name.trim();
    if (!newName || newName === oldName) return existing[0] as Category;

    const rows = await sql`
      UPDATE categories SET name = ${newName} WHERE id = ${id} RETURNING *
    `;
    // Keep products in sync — their category is stored as the name string.
    await sql`UPDATE products SET category = ${newName} WHERE category = ${oldName}`;
    return rows[0] as Category;
  },

  async deleteCategory(id: string): Promise<void> {
    await sql`DELETE FROM categories WHERE id = ${id}`;
  },

  // PRODUCTS

  /**
   * Bring an existing `products` table up to date with the product/service
   * columns. Every statement is idempotent, so this is safe to run on every
   * list/add/update.
   */
  async ensureProductSchema(): Promise<void> {
    if (productSchemaChecked) return;
    try {
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'PRODUCT'`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock NUMERIC`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_alert NUMERIC`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_discount_pct NUMERIC NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_price NUMERIC`;
      await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`;
      // The offer percentage is snapshotted per invoice line so the printed
      // invoice can show the discount that was actually applied.
      await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS offer_pct NUMERIC NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price NUMERIC`;
      productSchemaChecked = true;
    } catch (err) {
      console.error('Failed to ensure product schema:', err);
    }
  },

  async listProducts(): Promise<Product[]> {
    await this.ensureProductSchema();
    const rows = await sql`SELECT * FROM products ORDER BY name ASC`;
    return rows as Product[];
  },

  async getProduct(id: string): Promise<Product | null> {
    await this.ensureProductSchema();
    const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
    return rows.length > 0 ? (rows[0] as Product) : null;
  },

  async addProduct(input: {
    name: string;
    description: string | null;
    category: string;
    gst_rate: number;
    hsn_code: string | null;
    selling_price: number;
    item_type?: ItemType;
    cost_price?: number;
    current_stock?: number | null;
    low_stock_alert?: number | null;
    offer_discount_pct?: number;
    offer_price?: number | null;
    is_active?: boolean;
  }): Promise<Product> {
    await this.ensureProductSchema();
    const id = uid();
    // Services never hold stock, so those columns are always written as NULL.
    const isService = input.item_type === 'SERVICE';
    const rows = await sql`
      INSERT INTO products (
        id, name, description, category, gst_rate, hsn_code, selling_price,
        item_type, cost_price, current_stock, low_stock_alert,
        offer_discount_pct, offer_price, is_active
      )
      VALUES (
        ${id}, ${input.name}, ${input.description}, ${input.category},
        ${input.gst_rate}, ${input.hsn_code}, ${input.selling_price},
        ${isService ? 'SERVICE' : 'PRODUCT'}, ${input.cost_price ?? 0},
        ${isService ? null : input.current_stock ?? 0},
        ${isService ? null : input.low_stock_alert ?? 0},
        ${input.offer_discount_pct ?? 0}, ${input.offer_price ?? null},
        ${input.is_active ?? true}
      )
      RETURNING *
    `;
    return rows[0] as Product;
  },

  async updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
    await this.ensureProductSchema();
    if (Object.keys(patch).length === 0) return this.getProduct(id);

    // We update fields individually since dynamic SET with Neon SQL template tag is tricky
    if (patch.name !== undefined) await sql`UPDATE products SET name = ${patch.name} WHERE id = ${id}`;
    if (patch.description !== undefined) await sql`UPDATE products SET description = ${patch.description} WHERE id = ${id}`;
    if (patch.category !== undefined) await sql`UPDATE products SET category = ${patch.category} WHERE id = ${id}`;
    if (patch.gst_rate !== undefined) await sql`UPDATE products SET gst_rate = ${patch.gst_rate} WHERE id = ${id}`;
    if (patch.hsn_code !== undefined) await sql`UPDATE products SET hsn_code = ${patch.hsn_code} WHERE id = ${id}`;
    if (patch.selling_price !== undefined) await sql`UPDATE products SET selling_price = ${patch.selling_price} WHERE id = ${id}`;
    if (patch.item_type !== undefined) await sql`UPDATE products SET item_type = ${patch.item_type} WHERE id = ${id}`;
    if (patch.cost_price !== undefined) await sql`UPDATE products SET cost_price = ${patch.cost_price} WHERE id = ${id}`;
    if (patch.offer_discount_pct !== undefined) await sql`UPDATE products SET offer_discount_pct = ${patch.offer_discount_pct} WHERE id = ${id}`;
    if (patch.offer_price !== undefined) await sql`UPDATE products SET offer_price = ${patch.offer_price} WHERE id = ${id}`;
    if (patch.is_active !== undefined) await sql`UPDATE products SET is_active = ${patch.is_active} WHERE id = ${id}`;

    // Stock is meaningless for services — switching the type to SERVICE clears it.
    if (
      patch.current_stock !== undefined ||
      patch.low_stock_alert !== undefined ||
      patch.item_type !== undefined
    ) {
      const existing = await this.getProduct(id);
      if (existing && existing.item_type === 'SERVICE') {
        await sql`UPDATE products SET current_stock = NULL, low_stock_alert = NULL WHERE id = ${id}`;
      } else {
        if (patch.current_stock !== undefined)
          await sql`UPDATE products SET current_stock = ${patch.current_stock} WHERE id = ${id}`;
        if (patch.low_stock_alert !== undefined)
          await sql`UPDATE products SET low_stock_alert = ${patch.low_stock_alert} WHERE id = ${id}`;
      }
    }

    const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
    return rows.length > 0 ? (rows[0] as Product) : null;
  },

  /** Adjust stock after a completed sale. Services are skipped (stock is NULL). */
  async decrementStock(productId: string, qty: number): Promise<void> {
    try {
      await sql`
        UPDATE products
        SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - ${qty})
        WHERE id = ${productId} AND item_type = 'PRODUCT' AND current_stock IS NOT NULL
      `;
    } catch (err) {
      console.error(`Failed to decrement stock for ${productId}:`, err);
    }
  },

  async deleteProduct(id: string): Promise<void> {
    await sql`DELETE FROM products WHERE id = ${id}`;
  },

  // CUSTOMERS
  async upsertCustomer(name: string, phone: string, address?: string | null): Promise<Customer> {
    await ensureCustomerSchema();
    const id = uid();
    const rows = await sql`
      INSERT INTO customers (id, name, phone, address)
      VALUES (${id}, ${name}, ${phone}, ${address || null})
      ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address
      RETURNING *
    `;
    return rows[0] as Customer;
  },

  // ORDERS
  async orderIdExists(id: string): Promise<boolean> {
    const rows = await sql`SELECT 1 FROM orders WHERE id = ${id} LIMIT 1`;
    return rows.length > 0;
  },

  async listOrdersWithRelations(): Promise<OrderWithRelations[]> {
    const orders = await sql`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      ORDER BY o.created_at DESC
    `;

    if (orders.length === 0) return [];

    const orderIds = orders.map((o: any) => o.id);
    const items = await sql`
      SELECT * FROM order_items
      WHERE order_id = ANY(${orderIds})
    `;

    return orders.map((o: any) => ({
      ...o,
      items: items.filter((i: any) => i.order_id === o.id) as OrderItemRow[],
    })) as OrderWithRelations[];
  },

  async getOrderWithRelations(id: string): Promise<OrderWithRelations | null> {
    const orders = await sql`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ${id}
    `;
    if (orders.length === 0) return null;

    const items = await sql`SELECT * FROM order_items WHERE order_id = ${id}`;

    return {
      ...(orders[0] as any),
      items: items as OrderItemRow[],
    } as OrderWithRelations;
  },

  async deleteOrder(id: string): Promise<void> {
    // Order items are removed via ON DELETE CASCADE.
    await sql`DELETE FROM orders WHERE id = ${id}`;
  },

  // EXPENSES
  async listExpenses(): Promise<Expense[]> {
    const rows = await sql`
      SELECT * FROM expenses
      ORDER BY expense_date DESC, created_at DESC
    `;
    return rows as Expense[];
  },

  async addExpense(input: {
    title: string;
    category: string;
    amount: number;
    payment_mode: string;
    notes: string | null;
    expense_date: string;
  }): Promise<Expense> {
    const id = uid();
    const rows = await sql`
      INSERT INTO expenses (id, title, category, amount, payment_mode, notes, expense_date)
      VALUES (
        ${id}, ${input.title}, ${input.category}, ${input.amount},
        ${input.payment_mode}, ${input.notes}, ${input.expense_date}
      )
      RETURNING *
    `;
    return rows[0] as Expense;
  },

  async updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null> {
    if (Object.keys(patch).length === 0) {
      const rows = await sql`SELECT * FROM expenses WHERE id = ${id}`;
      return rows.length > 0 ? (rows[0] as Expense) : null;
    }

    if (patch.title !== undefined) await sql`UPDATE expenses SET title = ${patch.title} WHERE id = ${id}`;
    if (patch.category !== undefined) await sql`UPDATE expenses SET category = ${patch.category} WHERE id = ${id}`;
    if (patch.amount !== undefined) await sql`UPDATE expenses SET amount = ${patch.amount} WHERE id = ${id}`;
    if (patch.payment_mode !== undefined) await sql`UPDATE expenses SET payment_mode = ${patch.payment_mode} WHERE id = ${id}`;
    if (patch.notes !== undefined) await sql`UPDATE expenses SET notes = ${patch.notes} WHERE id = ${id}`;
    if (patch.expense_date !== undefined) await sql`UPDATE expenses SET expense_date = ${patch.expense_date} WHERE id = ${id}`;

    const rows = await sql`SELECT * FROM expenses WHERE id = ${id}`;
    return rows.length > 0 ? (rows[0] as Expense) : null;
  },

  async deleteExpense(id: string): Promise<void> {
    await sql`DELETE FROM expenses WHERE id = ${id}`;
  },

  // ORDER SUBMISSION
  async submitOrder(payload: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    customerAddress?: string | null;
    source: 'ONLINE' | 'OFFLINE';
    isGst: boolean;
    billDate: string;
    items: CartItem[];
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    discountAmount: number;
    gstPercentage: number;
    gstAmount: number;
    deliveryFee: number;
    grandTotal: number;
    cashReceived: number;
    splitCash?: number;
    splitGpay?: number;
    paymentMode: PaymentMode;
  }): Promise<{ orderId: string }> {
    // Neon HTTP doesn't natively support full interactive transactions in the simple
    // API, so we run statements sequentially/concurrently which is fine at this scale.

    const customer = await this.upsertCustomer(
      payload.customerName,
      payload.customerPhone,
      payload.customerAddress,
    );

    // Same stale-id guard as the regular sale path.
    const liveProductIds = await filterLiveProductIds(
      payload.items.map((item) => item.product_id),
    );
    const linkedId = (item: CartItem) =>
      item.product_id && liveProductIds.has(item.product_id) ? item.product_id : null;
    // Lines typed by hand (never picked from the catalogue) are linked by name.
    const nameMatches = await matchProductIdsByName(
      payload.items.filter((item) => !linkedId(item)).map((item) => item.name || ''),
    );

    // Each cart line becomes one order item, snapshotting its name and price.
    const finalOrderItems: Omit<OrderItemRow, 'id'>[] = payload.items.map((item) => ({
      order_id: payload.orderId,
      product_id:
        linkedId(item) ?? nameMatches.get((item.name || '').trim().toLowerCase()) ?? null,
      snapshot_name: item.name,
      snapshot_price: item.price,
      quantity: item.qty,
      offer_pct: item.offerPct ?? 0,
      original_price:
        (item.originalPrice ?? 0) > item.price ? (item.originalPrice as number) : null,
    }));

    // Subtotal is GST-exclusive (sum of line prices × qty).
    // grand_total = subtotal - discount + GST + delivery  (GST is added on top).
    const subtotalExclusive =
      payload.grandTotal + payload.discountAmount - payload.gstAmount - payload.deliveryFee;

    await sql`
      INSERT INTO orders (
        id, customer_id, source, status, is_gst, subtotal, discount_type, discount_value,
        discount_amount, gst_percentage, gst_amount, delivery_fee, grand_total,
        cash_received, split_cash, split_gpay, payment_mode, bill_date, created_at
      ) VALUES (
        ${payload.orderId}, ${customer.id}, ${payload.source}, 'COMPLETED', ${payload.isGst},
        ${subtotalExclusive},
        ${payload.discountType}, ${payload.discountValue}, ${payload.discountAmount},
        ${payload.gstPercentage}, ${payload.gstAmount}, ${payload.deliveryFee},
        ${payload.grandTotal}, ${payload.cashReceived},
        ${payload.splitCash ?? 0}, ${payload.splitGpay ?? 0},
        ${payload.paymentMode}, ${payload.billDate}, now()
      )
    `;

    // Insert order items now that the order row exists.
    await this.ensureProductSchema();
    await Promise.all(
      finalOrderItems.map((oi) =>
        sql`
          INSERT INTO order_items (
            id, order_id, product_id, snapshot_name, snapshot_price, quantity, offer_pct,
            original_price
          ) VALUES (
            ${uid()}, ${oi.order_id}, ${oi.product_id},
            ${oi.snapshot_name}, ${oi.snapshot_price}, ${oi.quantity}, ${oi.offer_pct},
            ${oi.original_price ?? null}
          )
        `
      ),
    );

    // Sell-through: reduce stock for every catalogued product on the bill.
    // Services have NULL stock and are skipped by the query.
    await Promise.all(
      finalOrderItems
        .filter((oi) => oi.product_id)
        .map((oi) => this.decrementStock(oi.product_id as string, oi.quantity)),
    );

    return { orderId: payload.orderId };
  },

  // ADVANCE ORDERS — partial-payment holds. Revenue is recognized only when the
  // balance is collected and finalizeAdvanceOrder turns the hold into an invoice.
  async listAdvanceOrders(): Promise<AdvanceOrderWithRelations[]> {
    await ensureAdvanceSchema();
    const rows = await sql`
      SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
      FROM advance_orders a
      JOIN customers c ON c.id = a.customer_id
      ORDER BY a.created_at DESC
    `;
    if (rows.length === 0) return [];

    const ids = rows.map((r: any) => r.id);
    const items = await sql`
      SELECT * FROM advance_order_items WHERE advance_order_id = ANY(${ids})
    `;

    return rows.map((r: any) => ({
      ...r,
      items: (items as AdvanceOrderItemRow[]).filter((i) => i.advance_order_id === r.id),
    })) as AdvanceOrderWithRelations[];
  },

  async getAdvanceOrder(id: string): Promise<AdvanceOrderWithRelations | null> {
    await ensureAdvanceSchema();
    const rows = await sql`
      SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
      FROM advance_orders a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.id = ${id}
    `;
    if (rows.length === 0) return null;
    const items = await sql`SELECT * FROM advance_order_items WHERE advance_order_id = ${id}`;
    return { ...(rows[0] as any), items: items as AdvanceOrderItemRow[] } as AdvanceOrderWithRelations;
  },

  async advanceOrderIdExists(id: string): Promise<boolean> {
    const rows = await sql`SELECT 1 FROM advance_orders WHERE id = ${id} LIMIT 1`;
    return rows.length > 0;
  },

  async createAdvanceOrder(payload: {
    advanceOrderId: string;
    customerName: string;
    customerPhone: string;
    customerAddress?: string | null;
    subtotal: number;
    totalAmount: number;
    depositAmount: number;
    depositPaymentMode: PaymentMode;
    discountType?: 'PERCENT' | 'FIXED';
    discountValue?: number;
    discountAmount?: number;
    isGst?: boolean;
    gstPercentage?: number;
    gstAmount?: number;
    deliveryFee?: number;
    deliveryDate: string | null;
    notes: string | null;
    items: {
      product_id: string | null;
      snapshot_name: string;
      snapshot_desc: string | null;
      snapshot_price: number;
      quantity: number;
      offer_pct?: number;
      original_price?: number | null;
    }[];
  }): Promise<{ advanceOrderId: string }> {
    const customer = await this.upsertCustomer(
      payload.customerName,
      payload.customerPhone,
      payload.customerAddress,
    );

    await ensureAdvanceSchema();
    const isGst = Boolean(payload.isGst) && (payload.gstPercentage ?? 0) > 0;
    await sql`
      INSERT INTO advance_orders (
        id, customer_id, status, subtotal, total_amount, deposit_amount,
        deposit_payment_mode, delivery_date, notes,
        discount_type, discount_value, discount_amount,
        is_gst, gst_percentage, gst_amount, delivery_fee
      ) VALUES (
        ${payload.advanceOrderId}, ${customer.id}, 'PENDING',
        ${payload.subtotal}, ${payload.totalAmount}, ${payload.depositAmount},
        ${payload.depositPaymentMode}, ${payload.deliveryDate}, ${payload.notes},
        ${payload.discountType ?? 'FIXED'}, ${payload.discountValue ?? 0}, ${payload.discountAmount ?? 0},
        ${isGst}, ${isGst ? payload.gstPercentage : 0}, ${isGst ? payload.gstAmount ?? 0 : 0},
        ${payload.deliveryFee ?? 0}
      )
    `;

    // Same stale-id guard as the regular sale path, so a catalogue product removed
    // after it was added to the cart cannot abort the advance order.
    const liveProductIds = await filterLiveProductIds(
      payload.items.map((it) => it.product_id),
    );

    await Promise.all(
      payload.items.map((it) =>
        sql`
          INSERT INTO advance_order_items (
            id, advance_order_id, product_id, snapshot_name, snapshot_desc, snapshot_price, quantity,
            offer_pct, original_price
          ) VALUES (
            ${uid()}, ${payload.advanceOrderId},
            ${it.product_id && liveProductIds.has(it.product_id) ? it.product_id : null},
            ${it.snapshot_name}, ${it.snapshot_desc}, ${it.snapshot_price}, ${it.quantity},
            ${it.offer_pct ?? 0},
            ${(it.original_price ?? 0) > it.snapshot_price ? it.original_price : null}
          )
        `,
      ),
    );

    return { advanceOrderId: payload.advanceOrderId };
  },

  async updateAdvanceOrderStatus(id: string, status: AdvanceOrderStatus): Promise<void> {
    await sql`UPDATE advance_orders SET status = ${status} WHERE id = ${id}`;
  },

  async cancelAdvanceOrder(id: string): Promise<void> {
    await sql`
      UPDATE advance_orders
      SET status = 'CANCELLED', cancelled_at = now()
      WHERE id = ${id}
    `;
  },

  async deleteAdvanceOrder(id: string): Promise<void> {
    await sql`DELETE FROM advance_orders WHERE id = ${id}`;
  },

  // Collect the remaining balance and turn the hold into a real invoice.
  // Reuses submitOrder for revenue recognition.
  async finalizeAdvanceOrder(payload: {
    advanceOrderId: string;
    invoiceId: string;
    isGst: boolean;
    gstPercentage: number;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    discountAmount: number;
    deliveryFee: number;
    paymentMode: PaymentMode;
    billDate: string;
  }): Promise<{ orderId: string }> {
    const advance = await this.getAdvanceOrder(payload.advanceOrderId);
    if (!advance) throw new Error('Advance order not found');
    if (advance.status === 'COMPLETED') throw new Error('Advance order already finalized');
    if (advance.status === 'CANCELLED') throw new Error('Advance order was cancelled');

    // Rebuild cart from the stored snapshot items.
    const cart: CartItem[] = advance.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      name: it.snapshot_name,
      desc: it.snapshot_desc || '',
      price: Number(it.snapshot_price),
      qty: it.quantity,
      offerPct: Number(it.offer_pct) || 0,
      originalPrice: Number(it.original_price) || undefined,
    }));

    // Carry the bill adjustments made when the advance was booked, then apply
    // any extra discount given while collecting the balance.
    const bill = advanceBill(advance, payload.discountAmount);
    const isGst = bill.isGst || (payload.isGst && payload.gstPercentage > 0);
    const gstPercentage = bill.isGst ? bill.gstPercentage : isGst ? payload.gstPercentage : 0;
    const taxableValue = Math.max(0, bill.subtotal - bill.discountAmount);
    const gstAmount = isGst ? taxableValue * (gstPercentage / 100) : 0;
    const deliveryFee = bill.deliveryFee + payload.deliveryFee;
    const grandTotal = taxableValue + gstAmount + deliveryFee;
    // Show the booking's own % only when it is the whole discount.
    const keepBookedType = bill.extraDiscount === 0 && bill.discountType === 'PERCENT';

    const { orderId } = await this.submitOrder({
      orderId: payload.invoiceId,
      customerName: advance.customer_name,
      customerPhone: advance.customer_phone,
      customerAddress: advance.customer_address,
      source: 'OFFLINE',
      isGst,
      billDate: payload.billDate,
      items: cart,
      discountType: keepBookedType ? 'PERCENT' : 'FIXED',
      discountValue: keepBookedType ? bill.discountValue : bill.discountAmount,
      discountAmount: bill.discountAmount,
      gstPercentage,
      gstAmount,
      deliveryFee,
      grandTotal,
      cashReceived: grandTotal,
      paymentMode: payload.paymentMode,
    });

    await sql`
      UPDATE advance_orders
      SET status = 'COMPLETED', finalized_order_id = ${orderId}, finalized_at = now()
      WHERE id = ${payload.advanceOrderId}
    `;

    return { orderId };
  },
};
