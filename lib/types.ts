export type Category = {
  id: string;
  name: string;
  created_at: string;
};

/** Products are physical items that carry stock; services are non-stocked add-ons. */
export type ItemType = 'PRODUCT' | 'SERVICE';

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  gst_rate: number; // Default GST % for this product (editable at billing)
  hsn_code: string | null; // HSN/SAC code shown on GST invoices
  selling_price: number; // GST-exclusive catalog price
  item_type: ItemType; // SERVICE rows never track stock
  cost_price: number; // Records only — never used in billing maths
  current_stock: number | null; // null for services
  low_stock_alert: number | null; // null when low-stock alerts don't apply
  offer_discount_pct: number; // 0 = no automatic offer
  offer_price: number | null; // Price billed when an offer is active
  is_active: boolean; // Visible in the Billing Panel picker
  created_at: string;
};

/** The price a catalogue row should bill at, honouring an automatic offer. */
export const effectivePrice = (p: {
  selling_price: number;
  offer_discount_pct: number;
  offer_price: number | null;
}): number => {
  if (p.offer_discount_pct > 0 && p.offer_price !== null && p.offer_price > 0) {
    return p.offer_price;
  }
  return p.selling_price;
};

/** Catalogue price an offer was taken from, or 0 when the product has no offer. */
export const offerOriginalPrice = (p: {
  selling_price: number;
  offer_discount_pct: number;
  offer_price: number | null;
}): number => {
  const original = Number(p.selling_price) || 0;
  return effectivePrice(p) < original ? original : 0;
};

/** Whole-number % saved going from `original` to `price` (e.g. 1000 -> 850 = 15). */
export const offerPercent = (original: number, price: number): number =>
  original > 0 ? Math.round(((original - price) / original) * 1000) / 10 : 0;

/**
 * Original (pre-offer) unit price of a saved bill line. Lines saved before the
 * original price was stored fall back to deriving it from the offer %.
 */
export const lineOriginalPrice = (item: {
  snapshot_price: number;
  offer_pct?: number;
  original_price?: number | null;
}): number => {
  const price = Number(item.snapshot_price) || 0;
  const stored = Number(item.original_price) || 0;
  if (stored > price) return stored;
  const pct = Number(item.offer_pct) || 0;
  if (pct > 0 && pct < 100) return Math.round((price / (1 - pct / 100)) * 100) / 100;
  return 0;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  created_at: string;
};

export type PaymentMode = 'CASH' | 'GPAY' | 'SPLIT';

export type OrderRow = {
  id: string;
  customer_id: string;
  source: 'ONLINE' | 'OFFLINE';
  status: 'COMPLETED' | 'PENDING';
  is_gst: boolean; // true = GST invoice, false = non-GST bill
  subtotal: number; // GST-exclusive (line price × qty); older bills stored it GST-inclusive
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  discount_amount: number;
  gst_percentage: number;
  gst_amount: number; // GST charged on (subtotal - discount)
  delivery_fee: number;
  grand_total: number; // = subtotal - discount + delivery
  cash_received: number; // total amount tendered (cash for CASH, gpay amount for GPAY, cash+gpay for SPLIT)
  split_cash: number; // cash portion when payment_mode = SPLIT
  split_gpay: number; // gpay portion when payment_mode = SPLIT
  payment_mode: PaymentMode;
  bill_date: string;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  snapshot_name: string;
  snapshot_price: number;
  quantity: number;
  offer_pct: number; // automatic offer applied to this line (0 = none)
  original_price?: number | null; // catalogue price before the offer
};

export type OrderWithRelations = OrderRow & {
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  items: OrderItemRow[];
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  payment_mode: string; // CASH | UPI | CARD | BANK | OTHER
  notes: string | null;
  expense_date: string;
  created_at: string;
};

export type AdvanceOrderStatus = 'PENDING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export type AdvanceOrderRow = {
  id: string;
  customer_id: string;
  status: AdvanceOrderStatus;
  subtotal: number;
  total_amount: number;
  deposit_amount: number;
  deposit_payment_mode: PaymentMode;
  // Bill adjustments recorded at booking and carried into the final invoice.
  discount_type?: 'PERCENT' | 'FIXED';
  discount_value?: number;
  discount_amount?: number;
  is_gst?: boolean;
  gst_percentage?: number;
  gst_amount?: number;
  delivery_fee?: number;
  delivery_date: string | null;
  notes: string | null;
  finalized_order_id: string | null;
  finalized_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type AdvanceOrderItemRow = {
  id: string;
  advance_order_id: string;
  product_id: string | null;
  snapshot_name: string;
  snapshot_desc: string | null;
  snapshot_price: number;
  quantity: number;
  offer_pct?: number;
  original_price?: number | null;
};

export type AdvanceOrderWithRelations = AdvanceOrderRow & {
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  items: AdvanceOrderItemRow[];
};

export type CartItem = {
  id: string;
  product_id: string | null;
  name: string;
  desc: string;
  price: number;
  qty: number;
  offerPct?: number; // automatic catalogue offer applied to this line
  originalPrice?: number; // catalogue price before the offer
};

/**
 * Shop / business profile used across the storefront, POS and printed invoices.
 * Stored as a single row in `shop_settings` (id = 'default') and fully
 * editable from the POS → Settings tab.
 */
export type ShopSettings = {
  owner_name: string;
  shop_name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  location: string;
  instagram_url: string;
  business_hours: string;
  services: string;
  gstin: string;
  accent_color: string; // hex e.g. '#8C1C13' — drives the theme app-wide
  logo_data_url: string | null; // data:image/...; null = use bundled /logo.png
  updated_at?: string;
};
