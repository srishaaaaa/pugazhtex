"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  User,
  Receipt,
  Search,
  ChevronDown,
  X,
  PackagePlus,
  ShoppingBag,
  Trash2,
  Plus,
  TrendingUp,
  Trophy,
  IndianRupee,
  BarChart2,
  Package,
  List,
  Globe,
  Zap,
  Menu,
  Printer,
  History,
  ChevronLeft,
  ChevronRight,
  Percent,
  Calendar,
  Download,
  LogOut,
  Eye,
  EyeOff,
  ShieldCheck,
  Shield,
  Lock,
  Pencil,
  Boxes,
  Smartphone,
  Check,
  Wallet,
  TrendingDown,
  Coins,
  Tag,
  Banknote,
  PiggyBank,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Clock,
  MessageSquare,
  Settings2,
  Scissors,
  SlidersHorizontal,
  Undo2,
  Target,
  CheckCircle2,
  Minus,
} from "lucide-react";
import {
  verifyPasscode,
  fetchProducts,
  fetchOrders,
  fetchOrderById,
  submitOrder,
  removeOrder,
  createProduct,
  editProduct,
  removeProduct,
  fetchExpenses,
  createExpense,
  removeExpense,
  fetchCategories,
  createCategory,
  renameCategory,
  removeCategory,
  fetchAdvanceOrders,
  createAdvanceOrder,
  cancelAdvanceOrder,
  removeAdvanceOrder,
  finalizeAdvanceOrder,
  setAdvanceOrderStatus,
  fetchShopSettings,
} from "@/app/pos/actions";
import { Product, Expense, Category, AdvanceOrderWithRelations, AdvanceOrderStatus, ShopSettings, ItemType, effectivePrice } from "@/lib/types";
import { DEFAULT_SHOP_SETTINGS } from "@/lib/shopProfile";
import SettingsPanel from "./SettingsPanel";
import LowStockAlarm, { type LowStockItem } from "./LowStockAlarm";

// Preset expense categories (users can also type a custom one)
const EXPENSE_CATEGORIES = [
  "Stock Purchase",
  "Rent",
  "Salaries",
  "Utilities",
  "Electricity",
  "Transport",
  "Marketing",
  "Repairs & Maintenance",
  "Taxes & Fees",
  "Miscellaneous",
] as const;

const EXPENSE_PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK", "OTHER"] as const;

// Payment options available at the point of sale.
// ORDER_PAYMENT_MODES is used for single-mode contexts (advance deposit / balance).
// POS_PAYMENT_MODES adds Split for full sales at the billing counter.
const ORDER_PAYMENT_MODES = ["CASH", "GPAY"] as const;
const POS_PAYMENT_MODES = ["CASH", "GPAY", "SPLIT"] as const;
type OrderPaymentMode = "CASH" | "GPAY" | "SPLIT";

// Shared date-window test reused by the Expenses tab and the analytics dashboard.
type PeriodKey = "all" | "today" | "week" | "month" | "year" | "custom";
const isDateInPeriod = (
  dateStr: string,
  period: PeriodKey,
  startStr: string,
  endStr: string,
): boolean => {
  const now = new Date();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (period === "all") return true;
  if (period === "today")
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  if (period === "week") {
    const start = new Date(now);
    const dow = start.getDay();
    start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow)); // Monday start
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === "month")
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  // custom range
  const t = d.getTime();
  const s = startStr ? new Date(startStr) : null;
  if (s) s.setHours(0, 0, 0, 0);
  const e = endStr ? new Date(endStr) : null;
  if (e) e.setHours(23, 59, 59, 999);
  if (s && e) return t >= s.getTime() && t <= e.getTime();
  if (s) return t >= s.getTime();
  if (e) return t <= e.getTime();
  return true;
};

type CatalogItem = {
  id: string;
  name: string;
  desc?: string;
  category?: string;
  price?: number;
  gstRate?: number;
  hsnCode?: string;
  productId?: string;
  itemType?: ItemType;
  costPrice?: number;
  stock?: number | null;
  lowStockAlert?: number | null;
  offerPct?: number;
  offerPrice?: number | null;
  isActive?: boolean;
};

type OrderItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  qty: number;
  product_id?: string | null;
  offerPct?: number; // automatic catalogue offer applied to this line
};

type CompletedOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  source: "ONLINE" | "OFFLINE";
  isGst: boolean;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
  gstPercentage?: number;
  gstAmount?: number;
  deliveryFee: number;
  grandTotal: number;
  cashReceived: number;
  splitCash?: number;
  splitGpay?: number;
  paymentMode: OrderPaymentMode;
  date: string;
  createdAt: string;
  status: "Completed" | "Pending";
};

const SearchableItemInput = ({
  item,
  catalog,
  updateItem,
  activeCategory = "ALL",
}: {
  item: OrderItem;
  catalog: CatalogItem[];
  updateItem: (id: string, field: keyof OrderItem, value: any) => void;
  activeCategory?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Inactive rows are hidden from the Billing Panel picker.
  const filteredCatalog = catalog.filter(
    (c) =>
      (activeCategory === "ALL" || (c.category || "General") === activeCategory) &&
      (c.isActive === undefined || c.isActive) &&
      (c.name.toLowerCase().includes(internalSearch.toLowerCase()) ||
        (c.desc && c.desc.toLowerCase().includes(internalSearch.toLowerCase()))),
  );

  // Apply a catalog pick to this cart row.
  const selectItem = (catItem: CatalogItem) => {
    updateItem(item.id, "name", catItem.name);
    updateItem(item.id, "desc", catItem.desc || "");
    updateItem(item.id, "product_id", catItem.productId || null);
    // An active catalogue offer is applied automatically on billing.
    const onOffer = (catItem.offerPct ?? 0) > 0 && (catItem.offerPrice ?? 0) > 0;
    updateItem(item.id, "price", onOffer ? (catItem.offerPrice as number) : (catItem.price ?? 0));
    updateItem(item.id, "offerPct", onOffer ? (catItem.offerPct as number) : 0);
    setIsOpen(false);
    setTimeout(() => {
      const priceInput = document.getElementById(`price-${item.id}`);
      if (priceInput) priceInput.focus();
    }, 50);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [internalSearch, isOpen]);

  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const activeItem = listRef.current.children[selectedIndex] as HTMLElement;
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== "Escape") {
      setIsOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredCatalog.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCatalog[selectedIndex]) {
        selectItem(filteredCatalog[selectedIndex]);
      } else if (internalSearch.trim()) {
        updateItem(item.id, "name", internalSearch.trim());
        updateItem(item.id, "desc", "");
        setIsOpen(false);
        setTimeout(() => {
          const priceInput = document.getElementById(`price-${item.id}`);
          if (priceInput) priceInput.focus();
        }, 50);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div
        className={`relative cursor-pointer bg-[#FFFFFF] border ${isOpen ? "border-black/10 bg-white" : "border-black/10"} hover:border-black/10 rounded-lg px-4 py-2.5 transition-colors flex justify-between items-center group`}
        onClick={() => {
          setIsOpen(!isOpen);
          setInternalSearch("");
        }}
      >
        <div className="flex-1">
          <div className="font-semibold text-[#000000] text-sm">
            {item.name || (
              <span className="text-[#000000] font-normal">
                Select an item...
              </span>
            )}
          </div>
          {item.desc && !isOpen && (
            <div className="text-[10px] text-[#000000] mt-0.5">{item.desc}</div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#000000] group-hover:text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#FFFFFF] border border-black/10 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 border-b border-black/10 bg-[#FFFFFF]">
            <div className="bg-[#FFFFFF] flex items-center px-3 py-2 rounded-md">
              <Search className="w-4 h-4 text-[#000000] mr-2" />
              <input
                type="text"
                placeholder="Search catalog..."
                className="w-full bg-transparent text-[#000000] text-sm focus:outline-none placeholder:text-[#000000]"
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCatalog.length > 0 ? (
              <ul className="py-1" ref={listRef}>
                {filteredCatalog.map((catItem, idx) => {
                  return (
                    <li
                      key={catItem.id}
                      className={`px-5 py-3 border-b border-transparent last:border-0 transition-colors cursor-pointer ${idx === selectedIndex ? "bg-[#FFFFFF] border-l-4 border-l-[var(--accent)]" : "hover:bg-[#FFFFFF] border-l-4 border-l-transparent"}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectItem(catItem);
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        selectItem(catItem);
                      }}
                      onClick={() => {
                        selectItem(catItem);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="flex justify-between items-center">
                        <div className="text-sm font-bold text-[#000000]">
                          {catItem.name}
                        </div>
                      </div>
                      {catItem.desc && (
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#000000] mt-1">
                          {catItem.desc}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-5 py-6 text-sm text-[#000000] text-center font-semibold">
                Press Enter to use "{internalSearch}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function POSBilling() {
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [role, setRole] = useState<"staff" | "admin" | null>(null);
  const [passcode, setPasscode] = useState<string>("");
  const [passcodeError, setPasscodeError] = useState<string>("");
  const [showPasscode, setShowPasscode] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<
    "billing" | "orders" | "analytics" | "inventory" | "expenses" | "advance" | "settings"
  >("billing");
  // Shop profile (name, contact details, logo) — editable from the Settings tab.
  const [shopSettings, setShopSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [isOnline, setIsOnline] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customOrderDate, setCustomOrderDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [items, setItems] = useState<OrderItem[]>([
    { id: "1", name: "", desc: "", price: 0, qty: 1 },
  ]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);

  // Advance orders (partial-payment holds) — separate from real revenue.
  const [advanceOrders, setAdvanceOrders] = useState<AdvanceOrderWithRelations[]>([]);
  const [showAdvanceSaveModal, setShowAdvanceSaveModal] = useState(false);
  const [advDeposit, setAdvDeposit] = useState<number | "">("");
  const [advDeliveryDate, setAdvDeliveryDate] = useState<string>("");
  const [advNotes, setAdvNotes] = useState<string>("");
  const [advDepositPaymentMode, setAdvDepositPaymentMode] = useState<OrderPaymentMode>("CASH");
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  const [selectedAdvance, setSelectedAdvance] = useState<AdvanceOrderWithRelations | null>(null);
  const [advanceViewMode, setAdvanceViewMode] = useState<"view" | "receive" | null>(null);
  const [receiveDiscountType, setReceiveDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [receiveDiscountValue, setReceiveDiscountValue] = useState<number | "">("");
  const [receivePaymentMode, setReceivePaymentMode] = useState<OrderPaymentMode>("CASH");
  const [receiveIsGst, setReceiveIsGst] = useState(false);
  const [receiveGstPct, setReceiveGstPct] = useState<number>(18);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [advSearchQuery, setAdvSearchQuery] = useState("");
  const [advStatusFilter, setAdvStatusFilter] = useState<"ALL" | AdvanceOrderStatus>("ALL");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">(
    "fixed",
  );
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<OrderPaymentMode>("CASH");
  // Split payment: cash + gpay portions (only used when paymentMode === "SPLIT")
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitGpay, setSplitGpay] = useState<number>(0);
  const [applyGST, setApplyGST] = useState<boolean>(false);
  const [gstPercentage, setGstPercentage] = useState<number>(18);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [completedBillData, setCompletedBillData] =
    useState<CompletedOrder | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [printModalData, setPrintModalData] = useState<{ id: string, type: "invoice" | "advance" } | null>(null);
  const [printPrefs, setPrintPrefs] = useState<{ paper: "thermal" | "a4", size: "58" | "80" | "a4" | "a5" }>({ paper: "thermal", size: "80" });

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal States


  // Analytics filter/navigation states
  const [analyticsPeriod, setAnalyticsPeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [analyticsSubTab, setAnalyticsSubTab] = useState<
    "revenue" | "today" | "products" | "coupons"
  >("revenue");
  // Which revenue dashboard is shown: all bills, GST invoices only, or non-GST bills only
  const [analyticsGstFilter, setAnalyticsGstFilter] = useState<
    "all" | "gst" | "nongst"
  >("all");
  const [analyticsSearchPhone, setAnalyticsSearchPhone] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [couponSearchQuery, setCouponSearchQuery] = useState("");

  // Expense tracker state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expTitle, setExpTitle] = useState("");
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expCustomCategory, setExpCustomCategory] = useState("");
  const [expAmount, setExpAmount] = useState<number | "">("");
  const [expPaymentMode, setExpPaymentMode] = useState<string>("CASH");
  const [expNotes, setExpNotes] = useState("");
  const [expDate, setExpDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [expensePeriod, setExpensePeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("month");
  const [expenseStartDate, setExpenseStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [expenseEndDate, setExpenseEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>("ALL");
  const [expenseSearch, setExpenseSearch] = useState("");

  // Sorting states
  const [expenseSortField, setExpenseSortField] = useState<
    "date" | "title" | "category" | "payment_mode" | "amount"
  >("date");
  const [expenseSortOrder, setExpenseSortOrder] = useState<"asc" | "desc">("desc");

  const [inventorySortField, setInventorySortField] = useState<
    "name" | "price" | "gst"
  >("name");
  const [inventorySortOrder, setInventorySortOrder] = useState<"asc" | "desc">("asc");

  const [orderSortField, setOrderSortField] = useState<
    "date" | "id" | "name" | "total" | "status"
  >("date");
  const [orderSortOrder, setOrderSortOrder] = useState<"asc" | "desc">("desc");

  // Main scroll container ref for resetting scroll to top
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Low-stock alarm shown on opening Inventory. It only sounds when some item
  // is newly low since the last acknowledgement; otherwise it opens silenced.
  const LOW_STOCK_ACK_KEY = "pos_low_stock_ack";
  const [lowStockAlarm, setLowStockAlarm] = useState<{
    items: LowStockItem[];
    sounding: boolean;
  } | null>(null);

  const readAckedLowStock = (): string[] => {
    try {
      const raw = localStorage.getItem(LOW_STOCK_ACK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const openInventory = () => {
    setActiveTab("inventory");
    setCompletedBillData(null);
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" });

    const low: LowStockItem[] = catalog
      .filter(
        (c) =>
          c.itemType !== "SERVICE" &&
          c.stock !== null &&
          c.stock !== undefined &&
          c.lowStockAlert !== null &&
          c.lowStockAlert !== undefined &&
          Number(c.stock) <= Number(c.lowStockAlert),
      )
      .sort((a, b) => Number(a.stock) - Number(b.stock))
      .map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        stock: Number(c.stock),
        alertAt: Number(c.lowStockAlert),
      }));
    if (low.length === 0) return;
    const acked = new Set(readAckedLowStock());
    setLowStockAlarm({ items: low, sounding: low.some((i) => !acked.has(i.id)) });
  };

  const acknowledgeLowStock = () => {
    // Remember exactly the items low right now; anything restocked drops out,
    // so it alarms again if it runs low later.
    try {
      localStorage.setItem(
        LOW_STOCK_ACK_KEY,
        JSON.stringify(lowStockAlarm?.items.map((i) => i.id) ?? []),
      );
    } catch {
      // Storage unavailable: the alarm simply sounds again next time.
    }
    setLowStockAlarm(null);
  };

  // Whenever activeTab, analyticsSubTab, or analyticsGstFilter changes, reset scroll to top
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab, analyticsSubTab, analyticsGstFilter]);

  useEffect(() => {
    const prefs = localStorage.getItem("shalistone_print_prefs");
    if (prefs) {
      try {
        setPrintPrefs(JSON.parse(prefs));
      } catch (e) {}
    }

    const auth =
      sessionStorage.getItem("pos_authorized") ||
      localStorage.getItem("pos_authorized");
    const storedRole =
      sessionStorage.getItem("pos_role") || localStorage.getItem("pos_role");

    if (auth === "true") {
      sessionStorage.setItem("pos_authorized", "true");
      if (storedRole) {
        sessionStorage.setItem("pos_role", storedRole);
        setRole(storedRole as "staff" | "admin");
        if (storedRole === "staff") {
          setActiveTab("billing");
        }
      } else {
        setRole("admin");
      }
      setIsAuthorized(true);
    }
    setIsCheckingAuth(false);
  }, []);

  const handleVerifyPasscode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const result = await verifyPasscode(passcode);
    if (result && result.success) {
      sessionStorage.setItem("pos_authorized", "true");
      sessionStorage.setItem("pos_role", result.role || "admin");
      setRole(result.role as "staff" | "admin");
      if (result.role === "staff") {
        setActiveTab("billing");
      }
      setIsAuthorized(true);
      setPasscode("");
      setPasscodeError("");
    } else {
      setPasscodeError("Incorrect passcode. Please try again.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("pos_authorized");
    localStorage.removeItem("pos_authorized");
    sessionStorage.removeItem("pos_role");
    localStorage.removeItem("pos_role");
    setRole(null);
    setPasscode("");
    setPasscodeError("");
    setIsAuthorized(false);
  };

  const productToCatalogItem = (p: Product): CatalogItem => {
    return {
      id: p.id,
      productId: p.id,
      name: p.name,
      desc: p.description || undefined,
      category: p.category || undefined,
      // Catalog is a pure price list — one selling price per product.
      price: Number(p.selling_price) || 0,
      gstRate: Number(p.gst_rate) || 0,
      hsnCode: p.hsn_code || undefined,
      itemType: p.item_type || "PRODUCT",
      costPrice: Number(p.cost_price) || 0,
      stock: p.current_stock === null || p.current_stock === undefined ? null : Number(p.current_stock),
      lowStockAlert:
        p.low_stock_alert === null || p.low_stock_alert === undefined
          ? null
          : Number(p.low_stock_alert),
      offerPct: Number(p.offer_discount_pct) || 0,
      offerPrice:
        p.offer_price === null || p.offer_price === undefined ? null : Number(p.offer_price),
      isActive: p.is_active === undefined ? true : Boolean(p.is_active),
    };
  };

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [productsData, ordersData, expensesData, categoriesData, advanceData, shopData] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
        fetchExpenses(),
        fetchCategories(),
        fetchAdvanceOrders(),
        fetchShopSettings(),
      ]);
      setShopSettings(shopData);
      setAdvanceOrders(
        advanceData.map((a) => ({
          ...a,
          subtotal: Number(a.subtotal) || 0,
          total_amount: Number(a.total_amount) || 0,
          deposit_amount: Number(a.deposit_amount) || 0,
          items: a.items.map((i) => ({
            ...i,
            snapshot_price: Number(i.snapshot_price) || 0,
            quantity: Number(i.quantity) || 0,
          })),
        })),
      );
      setCatalog(productsData.map(productToCatalogItem));
      setCategories(categoriesData);
      setExpenses(
        expensesData.map((e) => ({ ...e, amount: Number(e.amount) || 0 })),
      );

      setOrders(
        ordersData.map((o) => {
          return {
            id: o.id,
            customerName: o.customer_name || "Guest",
            customerPhone: o.customer_phone,
            customerAddress: o.customer_address || null,
            source: o.source,
            isGst: Boolean(o.is_gst),
            items: o.items.map((i) => ({
              id: i.id,
              name: i.snapshot_name,
              desc: i.snapshot_name === "Custom Item" ? "Custom" : "",
              price: Number(i.snapshot_price) || 0,
              qty: Number(i.quantity) || 0,
            })),
            subtotal: Number(o.subtotal) || 0,
            discount: Number(o.discount_amount) || 0,
            discountType: o.discount_type,
            discountValue: o.discount_value
              ? Number(o.discount_value)
              : undefined,
            gstPercentage: Number(o.gst_percentage) || 0,
            gstAmount: Number(o.gst_amount) || 0,
            deliveryFee: Number(o.delivery_fee) || 0,
            grandTotal: Number(o.grand_total) || 0,
            cashReceived: Number(o.cash_received) || 0,
            splitCash: Number((o as { split_cash?: number }).split_cash) || 0,
            splitGpay: Number((o as { split_gpay?: number }).split_gpay) || 0,
            paymentMode: (POS_PAYMENT_MODES as readonly string[]).includes(
              String(o.payment_mode),
            )
              ? (o.payment_mode as OrderPaymentMode)
              : "CASH",
            date: o.bill_date,
            createdAt: o.created_at,
            status: o.status === "COMPLETED" ? "Completed" : "Pending",
          };
        }),
      );
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Modal State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrder | null>(
    null,
  );
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatPrice, setNewCatPrice] = useState<number | "">("");
  const [newCatGst, setNewCatGst] = useState<number | "">(5);
  const [newCatHsn, setNewCatHsn] = useState<string>("");
  const [newCatCategory, setNewCatCategory] = useState<string>("");
  // Product ⇄ Service switch at the top of the catalog form.
  const [newCatType, setNewCatType] = useState<ItemType>("PRODUCT");
  // Stock + costing only apply to physical products.
  const [newCatCost, setNewCatCost] = useState<number | "">("");
  const [newCatStock, setNewCatStock] = useState<number | "">(0);
  const [newCatLowStock, setNewCatLowStock] = useState<number | "">(0);
  // Automatic offer applied on billing.
  const [newCatOfferPct, setNewCatOfferPct] = useState<number | "">("");
  const [newCatOfferPrice, setNewCatOfferPrice] = useState<number | "">("");
  const [newCatActive, setNewCatActive] = useState(true);

  const [isSavingCatalog, setIsSavingCatalog] = useState<boolean>(false); // guards Save Product against double-clicks
  const [inventorySearch, setInventorySearch] = useState<string>("");

  // Category management (create / rename / delete)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // ── Stock adjustment (restock / return / loss / reconcile) ───────────────
  type StockAdjustType = "RESTOCK" | "RETURN" | "LOSS" | "RECONCILE";
  const [stockAdjustTarget, setStockAdjustTarget] = useState<CatalogItem | null>(null);
  const [stockAdjustType, setStockAdjustType] = useState<StockAdjustType>("RESTOCK");
  const [stockAdjustQty, setStockAdjustQty] = useState<number>(0);
  const [stockAdjustNote, setStockAdjustNote] = useState("");
  const [isSavingStock, setIsSavingStock] = useState(false);

  const openStockAdjust = (item: CatalogItem) => {
    setStockAdjustTarget(item);
    setStockAdjustType("RESTOCK");
    setStockAdjustQty(0);
    setStockAdjustNote("");
  };

  const closeStockAdjust = () => {
    if (isSavingStock) return;
    setStockAdjustTarget(null);
  };

  // Where the count lands after this adjustment.
  const stockAdjustPreview = (() => {
    if (!stockAdjustTarget) return 0;
    const current = stockAdjustTarget.stock ?? 0;
    const qty = Math.max(0, Number(stockAdjustQty) || 0);
    switch (stockAdjustType) {
      case "RESTOCK":
      case "RETURN":
        return current + qty;
      case "LOSS":
        return Math.max(0, current - qty);
      case "RECONCILE":
        return qty;
    }
  })();

  const stockAdjustDelta = stockAdjustPreview - (stockAdjustTarget?.stock ?? 0);

  const saveStockAdjustment = async () => {
    if (!stockAdjustTarget || isSavingStock) return;
    const target = stockAdjustTarget;
    const qty = Math.max(0, Number(stockAdjustQty) || 0);

    if (stockAdjustType !== "RECONCILE" && qty === 0) {
      alert("Enter a quantity greater than 0.");
      return;
    }
    if (stockAdjustType === "LOSS" && qty > (target.stock ?? 0)) {
      const proceed = window.confirm(
        `Only ${target.stock ?? 0} in stock. Deducting ${qty} will set stock to 0. Continue?`,
      );
      if (!proceed) return;
    }

    setIsSavingStock(true);
    try {
      await editProduct(target.id, {
        current_stock: stockAdjustPreview,
        // Reconcile is an exact count, so align the low-stock warning with it too.
        low_stock_alert:
          stockAdjustType === "RECONCILE"
            ? Math.min(target.lowStockAlert ?? 0, stockAdjustPreview)
            : target.lowStockAlert ?? undefined,
      });
      await fetchData();
      setStockAdjustTarget(null);
    } catch (err) {
      console.error("Failed to adjust stock:", err);
      alert("Could not update stock. Please try again.");
    } finally {
      setIsSavingStock(false);
    }
  };

  // Advance-order receipt modal (shown after creating an advance order)
  const [advanceReceipt, setAdvanceReceipt] = useState<{
    id: string;
    customerName: string;
    customerPhone: string;
    total: number;
    deposit: number;
    balance: number;
  } | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(
    null,
  );

  const [activeCatalogRowId, setActiveCatalogRowId] = useState<string | null>(
    null,
  );
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTargetRowId, setCatalogTargetRowId] = useState<string | null>(
    null,
  );

  // Order search/filters state
  const [orderSearchId, setOrderSearchId] = useState("");
  const [orderSearchName, setOrderSearchName] = useState("");
  const [orderSearchPhone, setOrderSearchPhone] = useState("");
  const [orderFilterSource, setOrderFilterSource] = useState("ALL");
  const [orderFilterStatus, setOrderFilterStatus] = useState("ALL");
  const [historyPeriod, setHistoryPeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");
  const [historyStartDate, setHistoryStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [historyEndDate, setHistoryEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [advPeriod, setAdvPeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");
  const [advStartDate, setAdvStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [advEndDate, setAdvEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [selectedCoupon, setSelectedCoupon] = useState<string>("none");
  const coupons = [
    { code: "none", label: "No Coupon", type: "fixed", value: 0 },
    {
      code: "WELCOME10",
      label: "WELCOME10 (10% Off)",
      type: "percent",
      value: 10,
    },
    {
      code: "SUPERPOS",
      label: "SUPERPOS (₹100 Off)",
      type: "fixed",
      value: 100,
    },
    {
      code: "FESTIVE15",
      label: "FESTIVE15 (15% Off)",
      type: "percent",
      value: 15,
    },
  ];

  const handleCouponChange = (code: string) => {
    setSelectedCoupon(code);
    const coupon = coupons.find((c) => c.code === code);
    if (coupon) {
      setDiscountType(coupon.type as "fixed" | "percent");
      setDiscountValue(coupon.value);
    }
  };

  const getCouponCodeForOrder = (order: CompletedOrder) => {
    if (order.discount === 0) return "NONE";
    const matched = coupons.find((c) => {
      if (c.code === "none") return false;
      if (order.discountType && order.discountValue) {
        const typeMatches =
          c.type === (order.discountType === "PERCENT" ? "percent" : "fixed");
        const valMatches = c.value === order.discountValue;
        return typeMatches && valMatches;
      }
      if (c.type === "fixed") {
        return c.value === order.discount;
      } else {
        const calculated = order.subtotal * (c.value / 100);
        return Math.abs(calculated - order.discount) < 2;
      }
    });
    return matched ? matched.code.toUpperCase() : "PROMO";
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Math.random().toString(), name: "", desc: "", price: 0, qty: 1 },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof OrderItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleQtyChange = (id: string, newQty: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const finalQty = Math.max(1, newQty);
        return { ...item, qty: finalQty };
      }),
    );
  };

  const clearOrder = () => {
    setItems([
      { id: Math.random().toString(), name: "", desc: "", price: 0, qty: 1 },
    ]);
  };

  const resetCatalogForm = () => {
    setNewCatName("");
    setNewCatDesc("");
    setNewCatPrice("");
    setNewCatCost("");
    setNewCatGst(5);
    setNewCatHsn("");
    setNewCatCategory("");
    setNewCatType("PRODUCT");
    setNewCatStock(0);
    setNewCatLowStock(0);
    setNewCatOfferPct("");
    setNewCatOfferPrice("");
    setNewCatActive(true);
  };

  const openEditCatalog = (catItem: CatalogItem, targetRowId?: string) => {
    setEditingCatalogId(catItem.id);
    setNewCatName(catItem.name || "");
    setNewCatDesc(catItem.desc || "");
    setNewCatPrice(catItem.price ?? "");
    setNewCatGst(typeof catItem.gstRate === "number" ? catItem.gstRate : 18);
    setNewCatHsn(catItem.hsnCode || "");
    setNewCatCategory(catItem.category || "");
    setNewCatType(catItem.itemType || "PRODUCT");
    setNewCatCost(catItem.costPrice ?? "");
    setNewCatStock(catItem.stock ?? 0);
    setNewCatLowStock(catItem.lowStockAlert ?? 0);
    setNewCatOfferPct(catItem.offerPct ?? "");
    setNewCatOfferPrice(catItem.offerPrice ?? "");
    setNewCatActive(catItem.isActive === undefined ? true : catItem.isActive);

    setCatalogTargetRowId(targetRowId || null);
    setShowCatalogModal(true);
  };

  // ── Category management (create / rename / delete) ──────────────────
  const refreshCategories = async () => {
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (err) {
      console.error("Failed to refresh categories:", err);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert("Please enter a category name.");
      return;
    }
    if (
      categories.some((c) => c.name.toLowerCase() === name.toLowerCase())
    ) {
      alert("That category already exists.");
      return;
    }
    setIsSavingCategory(true);
    try {
      await createCategory(name);
      setNewCategoryName("");
      await refreshCategories();
    } catch (err) {
      console.error("Failed to add category:", err);
      alert("Could not add the category. Please try again.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategoryId) return;
    const name = editCategoryName.trim();
    if (!name) {
      alert("Category name cannot be empty.");
      return;
    }
    setIsSavingCategory(true);
    try {
      await renameCategory(editingCategoryId, name);
      setEditingCategoryId(null);
      setEditCategoryName("");
      // Renaming also updates products, so refresh both lists.
      await Promise.all([
        refreshCategories(),
        fetchProducts().then((data) => setCatalog(data.map(productToCatalogItem))),
      ]);
    } catch (err) {
      console.error("Failed to rename category:", err);
      alert("Could not rename the category. Please try again.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (
      !window.confirm(
        `Delete category "${cat.name}"? Products already using it keep their category name.`,
      )
    )
      return;
    try {
      await removeCategory(cat.id);
      await refreshCategories();
    } catch (err) {
      console.error("Failed to delete category:", err);
      alert("Could not delete the category. Please try again.");
    }
  };

  // Offer price preview: derived from the price + % until the user overrides it.
  const computedOfferPrice = useMemo(() => {
    const pct = Number(newCatOfferPct) || 0;
    const base = Number(newCatPrice) || 0;
    if (pct <= 0) return 0;
    return Math.round((base - (base * pct) / 100) * 100) / 100;
  }, [newCatOfferPct, newCatPrice]);

  const addToCatalog = async () => {
    if (!newCatName.trim()) {
      alert(newCatType === "SERVICE" ? "Service name is required." : "Product name is required.");
      return;
    }

    const priceNum = Number(newCatPrice);
    if (priceNum > 99999999.99) {
      alert(
        "The price exceeds the maximum allowable system limit of ₹99,999,999.99.",
      );
      return;
    }

    // An offer is only meaningful with a positive % and a resulting price.
    const offerPct = Number(newCatOfferPct) || 0;
    const offerPrice =
      offerPct > 0
        ? newCatOfferPrice === ""
          ? Math.round((priceNum - (priceNum * offerPct) / 100) * 100) / 100
          : Number(newCatOfferPrice)
        : null;

    const isService = newCatType === "SERVICE";

    const productPayload = {
      name: newCatName.trim(),
      description: newCatDesc || null,
      category: newCatCategory.trim() || "General",
      gst_rate: 0,
      hsn_code: null,
      selling_price: newCatPrice === "" ? 0 : Number(newCatPrice),
      item_type: newCatType,
      cost_price: newCatCost === "" ? 0 : Number(newCatCost),
      // Services never carry stock — the store nulls these out server-side.
      current_stock: isService ? null : newCatStock === "" ? 0 : Number(newCatStock),
      low_stock_alert: isService ? null : newCatLowStock === "" ? 0 : Number(newCatLowStock),
      offer_discount_pct: offerPct,
      offer_price: offerPrice,
      is_active: newCatActive,
    };

    // Persist a newly-typed category so it appears in the managed list next time.
    const catName = newCatCategory.trim();
    if (
      catName &&
      !categories.some((c) => c.name.toLowerCase() === catName.toLowerCase())
    ) {
      try {
        const created = await createCategory(catName);
        setCategories((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, created],
        );
      } catch {
        /* non-fatal: product still saves with the category text */
      }
    }

    if (isSavingCatalog) return; // ignore double-clicks
    setIsSavingCatalog(true);
    try {
    if (editingCatalogId) {
      const data = await editProduct(editingCatalogId, productPayload);
      if (!data) {
        alert(
          "Product not found — it may have been removed. Refresh and try again.",
        );
        return;
      }

      setCatalog((prev) =>
        prev.map((c) =>
          c.id === editingCatalogId ? productToCatalogItem(data) : c,
        ),
      );

      if (catalogTargetRowId) {
        updateItem(catalogTargetRowId, "name", data.name);
        updateItem(catalogTargetRowId, "price", effectivePrice(data));
        updateItem(catalogTargetRowId, "offerPct", Number(data.offer_discount_pct) || 0);
        setCatalogTargetRowId(null);
      }

      resetCatalogForm();
      setEditingCatalogId(null);
      setShowCatalogModal(false);
    } else {
      const product = await createProduct(productPayload);
      const newItem = productToCatalogItem(product);
      setCatalog([...catalog, newItem]);

      if (catalogTargetRowId) {
        updateItem(catalogTargetRowId, "name", product.name);
        updateItem(catalogTargetRowId, "price", effectivePrice(product));
        updateItem(
          catalogTargetRowId,
          "offerPct",
          Number(product.offer_discount_pct) || 0,
        );
        setCatalogTargetRowId(null);
      }

      resetCatalogForm();
      setShowCatalogModal(false);
    }
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const deleteFromCatalog = async (id: string) => {
    await removeProduct(id);
    setCatalog((prev) => prev.filter((c) => c.id !== id));
  };

  // Product prices are GST-exclusive. GST is charged on the discounted subtotal
  // (the taxable value) and added on top of it in the grand total.
  const subtotal = items.reduce((acc, item) => acc + item.price * item.qty, 0);
  const calculatedDiscount =
    discountType === "percent"
      ? subtotal * (discountValue / 100)
      : discountValue;
  const taxableValue = Math.max(0, subtotal - calculatedDiscount);
  const gstAmount =
    applyGST && gstPercentage > 0 ? taxableValue * (gstPercentage / 100) : 0;
  const grandTotal = taxableValue + gstAmount + deliveryFee;

  // Suggest a GST % from the products currently in the cart (their per-product
  // default rate). Used to pre-fill the changeable GST field when a GST invoice
  // is switched on. Falls back to the current value or 18%.
  const suggestGstRate = (): number => {
    for (const item of items) {
      if (!item.name) continue;
      const catItem = catalog.find(
        (c) =>
          (item.product_id &&
            (c.id === item.product_id || c.productId === item.product_id)) ||
          c.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      );
      if (catItem && typeof catItem.gstRate === "number" && catItem.gstRate > 0) {
        return catItem.gstRate;
      }
    }
    return gstPercentage || 18;
  };

  // Toggle between a GST invoice and a non-GST bill. When switching a GST
  // invoice on, pre-fill the (still editable) rate from the cart's products.
  const setGstBill = (on: boolean) => {
    setApplyGST(on);
    if (on) {
      setGstPercentage(suggestGstRate());
    }
  };

  // ─────────────────────────────────────────
  // ADVANCE ORDERS — deposit-only holds
  // ─────────────────────────────────────────

  // Format: DEP-YYYYMMDD-NNNN. Sequential-looking, unique enough for one shop.
  const generateAdvanceOrderId = () => {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `DEP-${ymd}-${rand}`;
  };

  const openAdvanceSaveModal = () => {
    if (!customerPhone || customerPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile contact number before saving an advance order.");
      return;
    }
    const hasInvalidItem = items.some(
      (i) => !i.name || i.name.trim() === "" || i.price === undefined || i.price <= 0,
    );
    if (hasInvalidItem || items.length === 0) {
      alert("Please ensure all items have a valid name and price greater than 0 before saving an advance order.");
      return;
    }
    setAdvDeposit("");
    setAdvDeliveryDate("");
    setAdvNotes("");
    setAdvDepositPaymentMode(paymentMode);
    setShowAdvanceSaveModal(true);
  };

  const saveAdvanceOrder = async () => {
    if (isSavingAdvance) return;
    const deposit = Number(advDeposit) || 0;
    if (deposit <= 0) {
      alert("Deposit amount must be greater than 0.");
      return;
    }
    if (deposit > grandTotal) {
      alert("Deposit cannot exceed the grand total. Use 'Complete Sale' for full payment.");
      return;
    }

    const advId = generateAdvanceOrderId();
    setIsSavingAdvance(true);
    try {
      await createAdvanceOrder({
        advanceOrderId: advId,
        customerName: customerName || "Guest",
        customerPhone,
        customerAddress: customerAddress || null,
        subtotal,
        totalAmount: grandTotal,
        depositAmount: deposit,
        depositPaymentMode: advDepositPaymentMode,
        deliveryDate: advDeliveryDate || null,
        notes: advNotes.trim() || null,
        items: items.map((i) => ({
          product_id: i.product_id || null,
          snapshot_name: i.name,
          snapshot_desc: i.desc || null,
          snapshot_price: i.price,
          quantity: i.qty,
        })),
      });

      // Capture receipt details before clearing the form.
      const receiptCustomerName = customerName || "Guest";
      const receiptCustomerPhone = customerPhone;

      // Reset billing form.
      setItems([{ id: "1", name: "", desc: "", price: 0, qty: 1 }]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setDiscountValue(0);
      setDeliveryFee(0);
      setCashReceived(0);
      setSplitCash(0);
      setSplitGpay(0);
      setShowAdvanceSaveModal(false);
      await fetchData();

      // Show a shareable receipt modal (Print / WhatsApp / New Sale).
      setAdvanceReceipt({
        id: advId,
        customerName: receiptCustomerName,
        customerPhone: receiptCustomerPhone,
        total: grandTotal,
        deposit,
        balance: Math.max(0, grandTotal - deposit),
      });
    } catch (err) {
      console.error("Failed to save advance order:", err);
      alert("Could not save the advance order. Please try again.");
    } finally {
      setIsSavingAdvance(false);
    }
  };

  const openReceiveBalance = (adv: AdvanceOrderWithRelations) => {
    setSelectedAdvance(adv);
    setAdvanceViewMode("receive");
    setReceiveDiscountType("FIXED");
    setReceiveDiscountValue("");
    setReceivePaymentMode("CASH");
    setReceiveIsGst(false);
    setReceiveGstPct(18);
  };

  const openAdvanceView = (adv: AdvanceOrderWithRelations) => {
    setSelectedAdvance(adv);
    setAdvanceViewMode("view");
  };

  const closeAdvanceDialog = () => {
    setSelectedAdvance(null);
    setAdvanceViewMode(null);
  };

  const balanceRemaining = (adv: AdvanceOrderWithRelations) =>
    Math.max(0, Number(adv.total_amount) - Number(adv.deposit_amount));

  const receiveBalanceDiscountAmount = (() => {
    if (!selectedAdvance) return 0;
    const base = balanceRemaining(selectedAdvance);
    const val = Number(receiveDiscountValue) || 0;
    return receiveDiscountType === "PERCENT" ? base * (val / 100) : val;
  })();

  const receiveBalanceFinalAmount = (() => {
    if (!selectedAdvance) return 0;
    return Math.max(0, balanceRemaining(selectedAdvance) - receiveBalanceDiscountAmount);
  })();

  const confirmReceiveBalance = async () => {
    if (!selectedAdvance || isFinalizing) return;
    if (receiveBalanceDiscountAmount > balanceRemaining(selectedAdvance)) {
      alert("Discount cannot exceed the remaining balance.");
      return;
    }
    setIsFinalizing(true);
    try {
      const invoiceId = `INV-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      await finalizeAdvanceOrder({
        advanceOrderId: selectedAdvance.id,
        invoiceId,
        isGst: receiveIsGst,
        gstPercentage: receiveIsGst ? receiveGstPct : 0,
        discountType: receiveDiscountType,
        discountValue: Number(receiveDiscountValue) || 0,
        discountAmount: receiveBalanceDiscountAmount,
        deliveryFee: 0,
        paymentMode: receivePaymentMode,
        billDate: new Date().toISOString(),
      });
      closeAdvanceDialog();
      await fetchData();

      // Open the shared completion modal (Print / WhatsApp / New Sale) for the new invoice.
      try {
        const created = await fetchOrderById(invoiceId);
        if (created) {
          setCompletedBillData({
            id: created.id,
            customerName: created.customer_name || "Guest",
            customerPhone: created.customer_phone,
            customerAddress: created.customer_address || null,
            source: created.source,
            isGst: Boolean(created.is_gst),
            items: created.items.map((i, idx) => ({
              id: i.id || `oi-${created.id}-${idx}`,
              name: i.snapshot_name,
              desc: "",
              price: Number(i.snapshot_price) || 0,
              qty: Number(i.quantity) || 0,
            })),
            subtotal: Number(created.subtotal) || 0,
            discount: Number(created.discount_amount) || 0,
            discountType: created.discount_type,
            discountValue: created.discount_value
              ? Number(created.discount_value)
              : undefined,
            gstPercentage: Number(created.gst_percentage) || 0,
            gstAmount: Number(created.gst_amount) || 0,
            deliveryFee: Number(created.delivery_fee) || 0,
            grandTotal: Number(created.grand_total) || 0,
            cashReceived: Number(created.cash_received) || 0,
            splitCash: Number((created as { split_cash?: number }).split_cash) || 0,
            splitGpay: Number((created as { split_gpay?: number }).split_gpay) || 0,
            paymentMode: (POS_PAYMENT_MODES as readonly string[]).includes(
              String(created.payment_mode),
            )
              ? (created.payment_mode as OrderPaymentMode)
              : "CASH",
            date: created.bill_date,
            createdAt: created.created_at,
            status: "Completed",
          });
        }
      } catch (mapErr) {
        console.error("Could not open completion modal:", mapErr);
      }
    } catch (err) {
      console.error("Failed to finalize advance order:", err);
      alert("Could not finalize the advance order. Please try again.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const doCancelAdvance = async (adv: AdvanceOrderWithRelations) => {
    if (!confirm(`Cancel advance order ${adv.id}? The deposit is treated as forfeit/refunded outside the system.`)) return;
    try {
      await cancelAdvanceOrder(adv.id);
      await fetchData();
    } catch (err) {
      console.error("Cancel failed:", err);
      alert("Could not cancel the advance order.");
    }
  };

  const doDeleteAdvance = async (adv: AdvanceOrderWithRelations) => {
    if (!confirm(`Permanently delete advance order ${adv.id}? This cannot be undone.`)) return;
    try {
      await removeAdvanceOrder(adv.id);
      await fetchData();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Could not delete the advance order.");
    }
  };

  const toggleAdvanceReady = async (adv: AdvanceOrderWithRelations) => {
    const next: AdvanceOrderStatus = adv.status === "READY" ? "PENDING" : "READY";
    try {
      await setAdvanceOrderStatus(adv.id, next);
      await fetchData();
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  // Completes and saves the sale to the database. Returns the created order
  // (or null if validation/creation failed). WhatsApp sharing is a separate,
  // Completes and saves the sale to the database with instant optimistic updates.
  const completeSale = async (): Promise<CompletedOrder | null> => {
    if (isSubmittingOrder) return null;

    if (!customerPhone || customerPhone.length !== 10) {
      alert(
        "Please enter a valid 10-digit mobile contact number to complete the sale.",
      );
      return null;
    }

    // Strict validation: every single row must have a name and a price > 0
    const hasInvalidItem = items.some(
      (i) =>
        !i.name ||
        i.name.trim() === "" ||
        i.price === undefined ||
        i.price <= 0,
    );

    if (hasInvalidItem || items.length === 0) {
      alert(
        "Please ensure all items have a valid name and a price greater than 0. Remove any empty rows before proceeding.",
      );
      return null;
    }
    const itemsToSave = items;

    // Recalculate values locally to avoid React state lag issues
    const localSubtotal = itemsToSave.reduce(
      (acc, item) => acc + item.price * item.qty,
      0,
    );
    const localCalculatedDiscount =
      discountType === "percent"
        ? localSubtotal * (discountValue / 100)
        : discountValue;
    // Prices are GST-exclusive: GST is added on top of the discounted subtotal.
    const localTaxableValue = Math.max(0, localSubtotal - localCalculatedDiscount);
    const localGstAmount =
      applyGST && gstPercentage > 0
        ? localTaxableValue * (gstPercentage / 100)
        : 0;
    const localGrandTotal = localTaxableValue + localGstAmount + deliveryFee;

    // Validate totals against PostgreSQL numeric(10,2) overflow limit (99,999,999.99)
    const MAX_LIMIT = 99999999.99;
    if (
      localSubtotal > MAX_LIMIT ||
      localGrandTotal > MAX_LIMIT ||
      cashReceived > MAX_LIMIT ||
      deliveryFee > MAX_LIMIT
    ) {
      alert(
        "The order totals exceed the maximum allowable system limit of ₹99,999,999.99. Please adjust the item prices, delivery fee, or cash received.",
      );
      return null;
    }

    // Validate individual item prices
    const hasTooExpensiveItem = itemsToSave.some(
      (i) => i.price > MAX_LIMIT || i.price * i.qty > MAX_LIMIT,
    );
    if (hasTooExpensiveItem) {
      alert(
        "One or more item prices exceed the maximum system limit of ₹99,999,999.99. Please correct the item prices.",
      );
      return null;
    }

    const currentTimeStr = new Date().toTimeString().split(" ")[0];
    let orderTimestamp = new Date().toISOString();
    if (customOrderDate) {
      const parsedDate = new Date(`${customOrderDate}T${currentTimeStr}`);
      if (!isNaN(parsedDate.getTime())) {
        orderTimestamp = parsedDate.toISOString();
      }
    }

    // Resolve the amount tendered and the split breakdown per payment mode.
    let receivedAmount = cashReceived;
    let splitCashVal = 0;
    let splitGpayVal = 0;
    if (paymentMode === "SPLIT") {
      splitCashVal = Number(splitCash) || 0;
      splitGpayVal = Number(splitGpay) || 0;
      receivedAmount = splitCashVal + splitGpayVal;
    } else if (paymentMode === "GPAY") {
      // GPay is an exact digital transfer — no change to return.
      receivedAmount = cashReceived > 0 ? cashReceived : localGrandTotal;
    }

    setIsSubmittingOrder(true);

    try {
      const { orderId: newOrderId } = await submitOrder({
        orderId: `INV-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        customerName: customerName || "Guest",
        customerPhone: customerPhone,
        customerAddress: customerAddress || null,
        source: isOnline ? "ONLINE" : "OFFLINE",
        isGst: applyGST,
        billDate: orderTimestamp,
        items: itemsToSave.map((i) => ({
          id: i.id,
          product_id: i.product_id || null,
          name: i.name,
          desc: i.desc,
          price: i.price,
          qty: i.qty,
          offerPct: i.offerPct ?? 0,
        })),
        discountType: discountType === "percent" ? "PERCENT" : "FIXED",
        discountValue: discountValue,
        discountAmount: localCalculatedDiscount,
        gstPercentage: applyGST ? gstPercentage : 0,
        gstAmount: localGstAmount,
        deliveryFee: deliveryFee,
        grandTotal: localGrandTotal,
        cashReceived: receivedAmount,
        splitCash: splitCashVal,
        splitGpay: splitGpayVal,
        paymentMode: paymentMode,
      });

      // Construct mappedOrder directly in memory to respond with ZERO blocking delay
      const mappedOrder: CompletedOrder = {
        id: newOrderId,
        customerName: customerName.trim() || "Guest",
        customerPhone: customerPhone,
        customerAddress: customerAddress.trim() || null,
        source: isOnline ? "ONLINE" : "OFFLINE",
        isGst: Boolean(applyGST),
        items: itemsToSave.map((i, idx) => ({
          id: `oi-${newOrderId}-${idx}`,
          name: i.name,
          desc: i.name === "Custom Item" ? "Custom" : (i.desc || ""),
          price: Number(i.price) || 0,
          qty: Number(i.qty) || 0,
        })),
        subtotal: Number(localSubtotal) || 0,
        discount: Number(localCalculatedDiscount) || 0,
        discountType: discountType === "percent" ? "PERCENT" : "FIXED",
        discountValue: discountValue ? Number(discountValue) : undefined,
        gstPercentage: applyGST ? Number(gstPercentage) : 0,
        gstAmount: Number(localGstAmount) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        grandTotal: Number(localGrandTotal) || 0,
        cashReceived: Number(receivedAmount) || 0,
        splitCash: splitCashVal,
        splitGpay: splitGpayVal,
        paymentMode: paymentMode,
        date: orderTimestamp,
        createdAt: new Date().toISOString(),
        status: "Completed",
      };

      // Instantly update orders history and open the completed receipt banner
      setOrders((prev) => [mappedOrder, ...prev]);
      setCompletedBillData(mappedOrder as any);

      // Non-blocking sync with backend database in the background
      fetchProducts()
        .then((data) => setCatalog(data.map(productToCatalogItem)))
        .catch((err) => console.error("Background sync error:", err));

      // Reset Form immediately
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setCustomOrderDate(new Date().toISOString().split("T")[0]);
      setItems([{ id: "1", name: "", desc: "", price: 0, qty: 1 }]);
      setDiscountValue(0);
      setDeliveryFee(0);
      setCashReceived(0);
      setSplitCash(0);
      setSplitGpay(0);
      setPaymentMode("CASH");
      setApplyGST(false);
      setGstPercentage(18);

      return mappedOrder;
    } catch (err: any) {
      console.error("Failed to complete sale:", err);
      alert("An error occurred while saving the sale. Please try again.");
      return null;
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Completes the sale first, then shares the saved bill over WhatsApp.
  const handleCompleteAndSendWhatsApp = async () => {
    if (!customerPhone || customerPhone.length !== 10) {
      alert(
        "Please enter a valid 10-digit mobile contact number to send bill via WhatsApp.",
      );
      return;
    }

    // Pre-open blank tab on desktop to prevent popup blocker from blocking WhatsApp after async await
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let popupWindow: Window | null = null;
    if (!isMobile) {
      popupWindow = window.open("about:blank", "_blank");
    }

    try {
      const order = await completeSale();
      if (order) {
        resendWhatsApp(order, popupWindow);
      } else if (popupWindow) {
        popupWindow.close();
      }
    } catch (err) {
      if (popupWindow) popupWindow.close();
      console.error(err);
    }
  };

  const resendWhatsApp = (
    order: CompletedOrder,
    existingWindow?: Window | null,
  ) => {
    if (!order.customerPhone || order.customerPhone.length < 10) {
      alert("Invalid customer phone number for this order.");
      if (existingWindow) existingWindow.close();
      return;
    }
    const domain = window.location.origin;
    const invoiceUrl = `${domain}/invoice/${order.id}`;
    const shopEmoji = String.fromCodePoint(0x2728);
    const checkEmoji = String.fromCodePoint(0x2705);
    const moneyEmoji = String.fromCodePoint(0x1f4b0);
    const receiptEmoji = String.fromCodePoint(0x1f4e6);
    let message = `${shopEmoji} *${shopSettings.shop_name}* ${shopEmoji}\n\n`;
    message += `${checkEmoji} Here are your ${order.isGst ? "GST invoice" : "bill"} details!\n\n`;

    message += `Subtotal: ₹${order.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    if (order.discount > 0) {
      message += `Discount Applied: -₹${order.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }

    const gstOnBill = Number(order.gstAmount) || 0;
    if (order.isGst && gstOnBill > 0.1) {
      const gstLabel = order.gstPercentage ? `GST (${order.gstPercentage}%)` : "GST";
      message += `${gstLabel}: ₹${gstOnBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }

    if (order.deliveryFee > 0) {
      message += `Delivery Fee: ₹${order.deliveryFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }

    message += `\n${moneyEmoji} *Total Amount: ₹${order.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}*\n`;
    message += `Payment: ${order.paymentMode}\n\n`;
    message += `${receiptEmoji} View and download your detailed digital receipt here:\n${invoiceUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = order.customerPhone.replace(/\D/g, "").slice(-10);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodedMessage}`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (existingWindow && !isMobile) {
      existingWindow.location.href = whatsappUrl;
    } else if (isMobile) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank");
    }
  };

  // Opens the Print Settings Modal for advance receipts
  const printAdvanceReceipt = (advId: string) => {
    setPrintModalData({ id: advId, type: "advance" });
  };

  // Shares the advance-order receipt link over WhatsApp.
  const shareAdvanceReceiptWhatsApp = (receipt: {
    id: string;
    customerName: string;
    customerPhone: string;
    total: number;
    deposit: number;
    balance: number;
  }) => {
    if (typeof window === "undefined") return;
    const domain = window.location.origin;
    const receiptUrl = `${domain}/advance/${receipt.id}`;
    const fmt = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const shopEmoji = String.fromCodePoint(0x2728);
    const receiptEmoji = String.fromCodePoint(0x1f4e6);
    let message = `${shopEmoji} *${shopSettings.shop_name}* ${shopEmoji}\n\n`;
    message += `Advance order confirmed!\n\n`;
    message += `Order Total: ₹${fmt(receipt.total)}\n`;
    message += `Deposit Paid: ₹${fmt(receipt.deposit)}\n`;
    message += `Balance Due: ₹${fmt(receipt.balance)}\n\n`;
    message += `${receiptEmoji} View your advance receipt here:\n${receiptUrl}`;
    const encoded = encodeURIComponent(message);
    const cleanPhone = (receipt.customerPhone || "").replace(/\D/g, "").slice(-10);
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this invoice? This action cannot be undone.",
      )
    )
      return;
    await removeOrder(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (selectedOrder?.id === orderId) setSelectedOrder(null);
    if (completedBillData?.id === orderId) setCompletedBillData(null);
    if (activeInvoiceId === orderId) setActiveInvoiceId(null);
  };

  // ── Expense tracker: handlers ──────────────────────────────────────
  const handleAddExpense = async () => {
    const amountNum =
      typeof expAmount === "number" ? expAmount : parseFloat(String(expAmount));
    const category =
      (expCategory === "__custom__" ? expCustomCategory : expCategory).trim() ||
      "General";
    if (!expTitle.trim()) {
      alert("Please enter what the expense was for.");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }
    setIsSavingExpense(true);
    try {
      const created = await createExpense({
        title: expTitle.trim(),
        category,
        amount: amountNum,
        payment_mode: expPaymentMode,
        notes: expNotes.trim() || null,
        expense_date: expDate,
      });
      setExpenses((prev) => [
        { ...created, amount: Number(created.amount) || 0 },
        ...prev,
      ]);
      // Keep category / payment mode / date for fast repeat entry
      setExpTitle("");
      setExpAmount("");
      setExpNotes("");
      if (expCategory === "__custom__") {
        setExpCategory(category);
        setExpCustomCategory("");
      }
    } catch (err) {
      console.error("Error adding expense:", err);
      alert("Could not save the expense. Please try again.");
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await removeExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("Error deleting expense:", err);
      alert("Could not delete the expense.");
    }
  };

  // Expenses filtered for the Expenses tab (period + category + search)
  const expenseStats = React.useMemo(() => {
    const filtered = expenses.filter((e) => {
      if (
        !isDateInPeriod(
          e.expense_date,
          expensePeriod,
          expenseStartDate,
          expenseEndDate,
        )
      )
        return false;
      if (expenseCategoryFilter !== "ALL" && e.category !== expenseCategoryFilter)
        return false;
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        if (
          !e.title.toLowerCase().includes(q) &&
          !e.category.toLowerCase().includes(q) &&
          !(e.notes || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    const sortedFiltered = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (expenseSortField === "date") {
        comparison =
          new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
      } else if (expenseSortField === "title") {
        comparison = (a.title || "").localeCompare(b.title || "");
      } else if (expenseSortField === "category") {
        comparison = (a.category || "").localeCompare(b.category || "");
      } else if (expenseSortField === "payment_mode") {
        comparison = (a.payment_mode || "").localeCompare(b.payment_mode || "");
      } else if (expenseSortField === "amount") {
        comparison = a.amount - b.amount;
      }
      return expenseSortOrder === "asc" ? comparison : -comparison;
    });

    const total = filtered.reduce((acc, e) => acc + e.amount, 0);
    const byCategory: Record<string, number> = {};
    filtered.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const categoryBreakdown = Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const topCategory = categoryBreakdown[0]?.category || "None";
    const allCategories = Array.from(
      new Set(expenses.map((e) => e.category)),
    ).sort();
    return {
      filtered: sortedFiltered,
      total,
      categoryBreakdown,
      topCategory,
      count: filtered.length,
      allCategories,
    };
  }, [
    expenses,
    expensePeriod,
    expenseStartDate,
    expenseEndDate,
    expenseCategoryFilter,
    expenseSearch,
    expenseSortField,
    expenseSortOrder,
  ]);

  // Total expenses within the CURRENT analytics window (drives Net Profit on the dashboard)
  const analyticsExpensesTotal = React.useMemo(() => {
    return expenses
      .filter((e) =>
        isDateInPeriod(
          e.expense_date,
          analyticsPeriod,
          analyticsStartDate,
          analyticsEndDate,
        ),
      )
      .reduce((acc, e) => acc + e.amount, 0);
  }, [expenses, analyticsPeriod, analyticsStartDate, analyticsEndDate]);

  // Real-time analytics derived from orders with period filtering
  const {
    analyticsFilteredOrders,
    totalOrdersCount,
    totalRevenueAmount,
    gstRevenue,
    nonGstRevenue,
    gstOrdersCount,
    nonGstOrdersCount,
    avgOrderValue,
    onlineOrders,
    offlineOrders,
    onlineRevenue,
    offlineRevenue,
    topItems,
    currentWeekNumber,
    weekRevenue,
    maxWeekRevenue,
    monthRevenue,
    maxMonthRevenue,
    totalYearRevenue,
    avgMonthRevenue,
    todayOrders,
    todayRevenue,
    todayOrdersCount,
    todayOnlineOrdersCount,
    todayOfflineOrdersCount,
    todayOnlineRevenue,
    todayOfflineRevenue,
    todayItemsSold,
    todayTopItems,
    monthlyRevenue,
    totalItemsSold,
    topCategory,
    topProduct,
    dayNames,
    monthNames,
    itemSales,
    now,
  } = React.useMemo(() => {
    const now = new Date();

    // GST dashboard scope: "all" bills, GST invoices only, or non-GST bills only.
    const passesGst = (o: CompletedOrder) =>
      analyticsGstFilter === "all" ||
      (analyticsGstFilter === "gst" ? o.isGst : !o.isGst);

    const analyticsFilteredOrders = orders.filter((o) => {
      if (!passesGst(o)) return false;
      if (
        analyticsSearchPhone &&
        !o.customerPhone.includes(analyticsSearchPhone)
      ) {
        return false;
      }
      const orderDate = new Date(o.date);
      if (analyticsPeriod === "today") {
        return (
          orderDate.getDate() === now.getDate() &&
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      }
      if (analyticsPeriod === "week") {
        const startOfWeek = new Date(now);
        const dayOfWeek = startOfWeek.getDay();
        const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        startOfWeek.setDate(startOfWeek.getDate() + distToMonday); // Monday start of week
        startOfWeek.setHours(0, 0, 0, 0);
        return orderDate >= startOfWeek;
      }
      if (analyticsPeriod === "month") {
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      }
      if (analyticsPeriod === "year") {
        return orderDate.getFullYear() === now.getFullYear();
      }
      if (analyticsPeriod === "custom") {
        const orderTime = orderDate.getTime();
        const start = analyticsStartDate ? new Date(analyticsStartDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        const end = analyticsEndDate ? new Date(analyticsEndDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        if (start && end) {
          return orderTime >= start.getTime() && orderTime <= end.getTime();
        } else if (start) {
          return orderTime >= start.getTime();
        } else if (end) {
          return orderTime <= end.getTime();
        }
        return true;
      }
      return true; // "all"
    });

    const totalOrdersCount = analyticsFilteredOrders.length;
    const totalRevenueAmount = analyticsFilteredOrders.reduce(
      (acc, o) => acc + o.grandTotal,
      0,
    );
    const avgOrderValue =
      totalOrdersCount > 0 ? totalRevenueAmount / totalOrdersCount : 0;

    const gstOrders = analyticsFilteredOrders.filter((o) => o.isGst);
    const nonGstOrders = analyticsFilteredOrders.filter((o) => !o.isGst);
    const gstRevenue = gstOrders.reduce((acc, o) => acc + o.grandTotal, 0);
    const nonGstRevenue = nonGstOrders.reduce(
      (acc, o) => acc + o.grandTotal,
      0,
    );
    const gstOrdersCount = gstOrders.length;
    const nonGstOrdersCount = nonGstOrders.length;

    // Split channels
    const onlineOrders = analyticsFilteredOrders.filter(
      (o) => o.source === "ONLINE",
    ).length;
    const offlineOrders = analyticsFilteredOrders.filter(
      (o) => o.source === "OFFLINE",
    ).length;

    // Split revenues
    const onlineRevenue = analyticsFilteredOrders
      .filter((o) => o.source === "ONLINE")
      .reduce((acc, o) => acc + o.grandTotal, 0);
    const offlineRevenue = analyticsFilteredOrders
      .filter((o) => o.source === "OFFLINE")
      .reduce((acc, o) => acc + o.grandTotal, 0);

    // Top items by revenue in analyticsFilteredOrders
    const itemSales: Record<
      string,
      { name: string; revenue: number; qty: number }
    > = {};
    analyticsFilteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (!item.name || item.name.startsWith("GST (")) return;
        if (!itemSales[item.name])
          itemSales[item.name] = { name: item.name, revenue: 0, qty: 0 };
        itemSales[item.name].revenue += item.price * item.qty;
        itemSales[item.name].qty += item.qty;
      });
    });
    const topItems = Object.values(itemSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Helper to get ISO week number of the year
    const getWeekOfYear = (d: Date) => {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7; // Monday = 0, Sunday = 6
      target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
      }
      return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    };
    const currentWeekNumber = getWeekOfYear(now);

    // Revenue per day of current week (Mon–Sun) - CONSTANT (independent of analyticsPeriod filters)
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekRevenue = [0, 0, 0, 0, 0, 0, 0];

    // Find Monday to Sunday of current calendar week
    const currentDayOfWeek = now.getDay();
    const distToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const mondayOfThisWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + distToMon,
    );
    mondayOfThisWeek.setHours(0, 0, 0, 0);

    const sundayOfThisWeek = new Date(mondayOfThisWeek);
    sundayOfThisWeek.setDate(mondayOfThisWeek.getDate() + 6);
    sundayOfThisWeek.setHours(23, 59, 59, 999);

    orders.forEach((order) => {
      if (!passesGst(order)) return;
      if (analyticsSearchPhone) {
        const q = analyticsSearchPhone.toLowerCase();
        const matchPhone = order.customerPhone.includes(q);
        const matchInvoice = order.id.toLowerCase().includes(q);
        if (!matchPhone && !matchInvoice) {
          return;
        }
      }
      const orderDate = new Date(order.date);
      const orderTime = orderDate.getTime();
      if (
        orderTime >= mondayOfThisWeek.getTime() &&
        orderTime <= sundayOfThisWeek.getTime()
      ) {
        const day = (orderDate.getDay() + 6) % 7;
        weekRevenue[day] += order.grandTotal;
      }
    });
    const maxWeekRevenue = Math.max(...weekRevenue, 1);

    // Revenue per month of current year - CONSTANT (independent of analyticsPeriod filters)
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthRevenue = Array(12).fill(0);
    orders.forEach((order) => {
      if (!passesGst(order)) return;
      if (analyticsSearchPhone) {
        const q = analyticsSearchPhone.toLowerCase();
        const matchPhone = order.customerPhone.includes(q);
        const matchInvoice = order.id.toLowerCase().includes(q);
        if (!matchPhone && !matchInvoice) {
          return;
        }
      }
      const d = new Date(order.date);
      if (d.getFullYear() === now.getFullYear()) {
        monthRevenue[d.getMonth()] += order.grandTotal;
      }
    });
    const maxMonthRevenue = Math.max(...monthRevenue, 1);
    const totalYearRevenue = monthRevenue.reduce((a, b) => a + b, 0);
    const avgMonthRevenue = totalYearRevenue / 12;

    // New Detailed KPI Computations based on analyticsFilteredOrders
    const todayOrders = orders.filter((o) => {
      if (!passesGst(o)) return false;
      if (analyticsSearchPhone) {
        const q = analyticsSearchPhone.toLowerCase();
        const matchPhone = o.customerPhone.includes(q);
        const matchInvoice = o.id.toLowerCase().includes(q);
        if (!matchPhone && !matchInvoice) {
          return false;
        }
      }
      const d = new Date(o.date);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    });

    const todayRevenue = todayOrders.reduce((acc, o) => acc + o.grandTotal, 0);

    const todayOrdersCount = todayOrders.length;
    const todayOnlineOrdersCount = todayOrders.filter(
      (o) => o.source === "ONLINE",
    ).length;
    const todayOfflineOrdersCount = todayOrders.filter(
      (o) => o.source === "OFFLINE",
    ).length;

    const todayOnlineRevenue = todayOrders
      .filter((o) => o.source === "ONLINE")
      .reduce((acc, o) => acc + o.grandTotal, 0);
    const todayOfflineRevenue = todayOrders
      .filter((o) => o.source === "OFFLINE")
      .reduce((acc, o) => acc + o.grandTotal, 0);

    const todayItemsSold = todayOrders.reduce(
      (acc, o) =>
        acc +
        o.items.reduce((sum, item) => {
          const isGST = item.name && item.name.startsWith("GST (");
          return sum + (isGST ? 0 : item.qty);
        }, 0),
      0,
    );

    // Today's top items
    const todayItemSales: Record<
      string,
      { name: string; revenue: number; qty: number }
    > = {};
    todayOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (!item.name || item.name.startsWith("GST (")) return;
        if (!todayItemSales[item.name])
          todayItemSales[item.name] = { name: item.name, revenue: 0, qty: 0 };
        todayItemSales[item.name].revenue += item.price * item.qty;
        todayItemSales[item.name].qty += item.qty;
      });
    });
    const todayTopItems = Object.values(todayItemSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const monthlyRevenue = orders
      .filter((o) => {
        if (!passesGst(o)) return false;
        const d = new Date(o.date);
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .reduce((acc, o) => acc + o.grandTotal, 0);

    const totalItemsSold = analyticsFilteredOrders.reduce(
      (acc, o) =>
        acc +
        o.items.reduce((sum, item) => {
          const isGST = item.name && item.name.startsWith("GST (");
          return sum + (isGST ? 0 : item.qty);
        }, 0),
      0,
    );

    const categorySales: Record<string, number> = {};
    analyticsFilteredOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (item.name && item.name.startsWith("GST (")) return;
        const cat = item.desc || "Uncategorized";
        if (!categorySales[cat]) categorySales[cat] = 0;
        categorySales[cat] += item.price * item.qty;
      });
    });
    const topCategory =
      Object.keys(categorySales).length > 0
        ? Object.entries(categorySales).sort((a, b) => b[1] - a[1])[0][0]
        : "None";
    const topProduct = topItems[0]?.name || "None";
    return {
      analyticsFilteredOrders,
      totalOrdersCount,
      totalRevenueAmount,
      gstRevenue,
      nonGstRevenue,
      gstOrdersCount,
      nonGstOrdersCount,
      avgOrderValue,
      onlineOrders,
      offlineOrders,
      onlineRevenue,
      offlineRevenue,
      topItems,
      currentWeekNumber,
      weekRevenue,
      maxWeekRevenue,
      monthRevenue,
      maxMonthRevenue,
      totalYearRevenue,
      avgMonthRevenue,
      todayOrders,
      todayRevenue,
      todayOrdersCount,
      todayOnlineOrdersCount,
      todayOfflineOrdersCount,
      todayOnlineRevenue,
      todayOfflineRevenue,
      todayItemsSold,
      todayTopItems,
      monthlyRevenue,
      totalItemsSold,
      topCategory,
      topProduct,
      dayNames,
      monthNames,
      itemSales,
      now,
    };
  }, [
    orders,
    analyticsSearchPhone,
    analyticsPeriod,
    analyticsStartDate,
    analyticsEndDate,
    analyticsGstFilter,
  ]);

  // Inventory-derived data (pure catalog — stock tracking removed).
  const inventoryProducts = catalog.filter((c) => !c.id.startsWith("default-"));

  const filteredInventory = inventoryProducts
    .filter((p) => {
      if (!inventorySearch.trim()) return true;
      const q = inventorySearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.desc || "").toLowerCase().includes(q) ||
        (p.hsnCode || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      if (inventorySortField === "name") {
        comparison = (a.name || "").localeCompare(b.name || "");
      } else if (inventorySortField === "price") {
        comparison = (a.price ?? 0) - (b.price ?? 0);
      } else if (inventorySortField === "gst") {
        comparison = (a.gstRate ?? 0) - (b.gstRate ?? 0);
      }
      return inventorySortOrder === "asc" ? comparison : -comparison;
    });

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          <span className="text-xs text-[#000000] font-bold uppercase tracking-wider">
            Verifying Session...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Custom luxury grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--accent)/0.03_1px,transparent_1px),linear-gradient(to_bottom,var(--accent)/0.03_1px,transparent_1px)] bg-[size:4rem_4rem]" />

        {/* Abstract Background Orbs */}
        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-[var(--accent)]/10 rounded-full blur-[150px] animate-pulse" />
        <div
          className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] bg-[var(--accent)]/10 rounded-full blur-[150px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />

        {/* Main Card Container */}
        <div className="relative z-10 w-full max-w-md bg-white border border-[var(--accent)]/30 rounded-[2.5rem] p-8 md:p-10 shadow-[0_30px_70px_rgba(63,63,70,0.1)] overflow-hidden group flex flex-col items-center text-center">
          {/* Card top border gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[var(--accent)] via-[var(--accent)] to-[var(--accent)]" />

          {/* Logo with Gradient Hover Glow */}
          <div className="relative group mb-6">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent)] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-[var(--accent)]/30 shadow-lg">
              <img
                src={shopSettings.logo_data_url || "/logo.png"}
                alt={`${shopSettings.shop_name} Logo`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-serif text-[var(--accent)] tracking-tight leading-tight mb-2">
            {shopSettings.shop_name}
          </h1>
          <p className="text-[#1C1917]/50 text-xs font-bold uppercase tracking-[0.2em] mb-8">
            Boutique POS Terminal{shopSettings.tagline ? ` • ${shopSettings.tagline}` : ""}
          </p>

          {/* Form */}
          <form
            onSubmit={handleVerifyPasscode}
            className="w-full space-y-6 text-left"
          >
            <div className="space-y-3">
              <label className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-[0.25em] ml-1">
                Security Passcode
              </label>
              <div className="relative group/input">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--accent)] group-focus-within/input:text-[var(--accent)] transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPasscode ? "text" : "password"}
                  name="update-pos-passcode"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full bg-[#FAFAFA] border border-black/10 hover:border-[var(--accent)]/50 focus:border-[var(--accent)] focus:bg-white rounded-2xl pl-13 pr-13 py-3.5 text-[var(--accent)] font-mono tracking-widest text-lg focus:outline-none transition-all placeholder:text-black/20"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (passcodeError) setPasscodeError("");
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-black/30 hover:text-[var(--accent)] transition-colors cursor-pointer"
                >
                  {showPasscode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {passcodeError && (
                <p className="text-xs text-[#27272A] font-bold mt-2 ml-1 animate-in fade-in slide-in-from-top-1">
                  {passcodeError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-[var(--accent)] via-[var(--accent)] to-[var(--accent)] hover:brightness-105 active:scale-[0.98] text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-[0_10px_30px_rgba(63,63,70,0.2)] flex items-center justify-center gap-3 mt-4 group cursor-pointer border border-[var(--accent)]/30"
            >
              Authenticate
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-white" />
            </button>
          </form>

          {/* Status Badge */}
          <div className="mt-8 inline-flex items-center gap-2 px-3 py-1 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-full shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[8px] font-bold text-[var(--accent)] tracking-[0.15em] uppercase">
              SYSTEM ONLINE • ENCRYPTED
            </span>
          </div>
        </div>

        {/* Footnote */}
        <div className="mt-6 text-[#1C1917]/30 text-[9px] font-bold tracking-widest uppercase">
          {shopSettings.shop_name} Terminal v1.0
        </div>
      </div>
    );
  }

  // Filtered orders for Order History tab
  const historyFilteredOrders = orders.filter((order) => {
    const matchId = order.id
      .toLowerCase()
      .includes(orderSearchId.toLowerCase());
    const matchName = order.customerName
      .toLowerCase()
      .includes(orderSearchName.toLowerCase());
    const matchPhone = (order.customerPhone || "").includes(orderSearchPhone);
    const matchSource =
      orderFilterSource === "ALL" || order.source === orderFilterSource;
    const matchStatus =
      orderFilterStatus === "ALL" ||
      order.status.toUpperCase() === orderFilterStatus.toUpperCase();

    // Period match
    let matchPeriod = true;
    if (historyPeriod !== "all") {
      const orderDate = new Date(order.date);
      const orderTime = orderDate.getTime();
      const now = new Date();

      if (historyPeriod === "today") {
        matchPeriod = orderDate.toDateString() === now.toDateString();
      } else if (historyPeriod === "week") {
        const currentDay = now.getDay();
        const distanceToMon = currentDay === 0 ? -6 : 1 - currentDay;
        const startOfWeek = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + distanceToMon,
        );
        startOfWeek.setHours(0, 0, 0, 0);
        matchPeriod = orderTime >= startOfWeek.getTime();
      } else if (historyPeriod === "month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchPeriod = orderTime >= startOfMonth.getTime();
      } else if (historyPeriod === "year") {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        matchPeriod = orderTime >= startOfYear.getTime();
      } else if (historyPeriod === "custom") {
        const start = historyStartDate ? new Date(historyStartDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        const end = historyEndDate ? new Date(historyEndDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        if (start && end) {
          matchPeriod =
            orderTime >= start.getTime() && orderTime <= end.getTime();
        } else if (start) {
          matchPeriod = orderTime >= start.getTime();
        } else if (end) {
          matchPeriod = orderTime <= end.getTime();
        }
      }
    }

    return (
      matchId &&
      matchName &&
      matchPhone &&
      matchSource &&
      matchStatus &&
      matchPeriod
    );
  }).sort((a, b) => {
    let comparison = 0;
    if (orderSortField === "date") {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (orderSortField === "id") {
      comparison = (a.id || "").localeCompare(b.id || "");
    } else if (orderSortField === "name") {
      comparison = (a.customerName || "").localeCompare(b.customerName || "");
    } else if (orderSortField === "total") {
      comparison = (a.grandTotal || 0) - (b.grandTotal || 0);
    } else if (orderSortField === "status") {
      comparison = (a.status || "").localeCompare(b.status || "");
    }
    return orderSortOrder === "asc" ? comparison : -comparison;
  });

  const handleExportCSV = () => {
    if (historyFilteredOrders.length === 0) {
      alert("No orders available to export.");
      return;
    }

    // CSV Headers padded with spaces to ensure columns default to a readable width in Excel
    const headers = [
      "Order ID          ",
      "Date                   ",
      "Customer Name           ",
      "Customer Phone          ",
      "Source        ",
      "Subtotal      ",
      "Discount      ",
      "Delivery Fee  ",
      "Grand Total   ",
      "Status        ",
      "Items                                                                               ",
    ];

    // CSV Rows
    const rows = historyFilteredOrders.map((o) => {
      const itemsStr = o.items.map((i) => `${i.name} (x${i.qty})`).join("; ");

      // Formatting date: MM/DD/YYYY HH:MM AM/PM as an Excel text formula to prevent ### errors.
      // Date comes from the (backdatable) bill_date; the time comes from the real
      // transaction timestamp (created_at) rendered in IST.
      const dateStr = new Date(o.date).toLocaleDateString("en-IN");
      const timeStr = new Date(o.createdAt || o.date).toLocaleTimeString(
        "en-IN",
        {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        },
      );
      const formattedDate = `"=""${dateStr} ${timeStr}"""`;

      // Formatting phone number as an Excel text formula to prevent scientific notation
      const formattedPhone = o.customerPhone
        ? `"=""${o.customerPhone}"""`
        : `"N/A"`;

      return [
        o.id,
        formattedDate,
        o.customerName,
        formattedPhone,
        o.source,
        o.subtotal,
        o.discount,
        o.deliveryFee,
        o.grandTotal,
        o.status,
        `"${itemsStr.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            if (typeof val === "string" && !val.startsWith('"')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Order_History_${historyPeriod}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportInventoryCSV = () => {
    if (inventoryProducts.length === 0) {
      alert("No products in inventory to export.");
      return;
    }
    const headers = [
      "Product ID",
      "Name",
      "Type",
      "Description",
      "Category",
      "Price",
      "Cost Price",
      "Stock",
      "Low Stock Alert",
      "Offer %",
      "Offer Price",
      "Active",
    ];
    const rows = inventoryProducts.map((p) => [
      p.id,
      p.name,
      p.itemType === "SERVICE" ? "SERVICE" : "PRODUCT",
      p.desc || "",
      p.category || "",
      p.price ?? "",
      p.costPrice ?? "",
      // Services have no stock by design.
      p.itemType === "SERVICE" ? "" : (p.stock ?? ""),
      p.itemType === "SERVICE" ? "" : (p.lowStockAlert ?? ""),
      p.offerPct ?? 0,
      p.offerPrice ?? "",
      p.isActive === false ? "No" : "Yes",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Inventory_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#000000] flex flex-row font-sans overflow-hidden">
      {/* Stock Adjustment Modal — restock / return / loss / reconcile */}
      {stockAdjustTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
          onClick={closeStockAdjust}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 bg-[var(--accent)] text-white">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black tracking-tight truncate">
                    Adjust Inventory Stock
                  </h3>
                  <p className="text-[10px] font-semibold text-white/80">
                    Restock, return, deduct loss, or reconcile count
                  </p>
                </div>
              </div>
              <button
                onClick={closeStockAdjust}
                disabled={isSavingStock}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Close stock adjustment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Target + current stock */}
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--accent-wash)] border border-[var(--accent)]/25">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] mb-0.5 flex items-center gap-1.5">
                    <Package className="w-3 h-3" /> Target Item
                  </p>
                  <p className="text-sm font-bold text-black truncate">
                    {stockAdjustTarget.name}
                  </p>
                  {stockAdjustTarget.hsnCode && (
                    <p className="text-[10px] font-mono text-black/45 mt-0.5">
                      HSN {stockAdjustTarget.hsnCode}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-black/45">
                    Current Stock
                  </p>
                  <p className="text-lg font-black text-black leading-tight">
                    {stockAdjustTarget.stock ?? 0}
                    <span className="text-[10px] font-bold text-black/45 ml-1">
                      units
                    </span>
                  </p>
                </div>
              </div>
              {/* Adjustment type */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-2">
                  Select Adjustment Type <span className="text-red-500">*</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { key: "RESTOCK", label: "Restock", sub: "+ Add", Icon: Plus, tone: "text-emerald-600" },
                      { key: "RETURN", label: "Return", sub: "+ Add", Icon: Undo2, tone: "text-blue-600" },
                      { key: "LOSS", label: "Loss / Dmg", sub: "− Deduct", Icon: Minus, tone: "text-red-600" },
                      { key: "RECONCILE", label: "Reconcile", sub: "Exact Set", Icon: Target, tone: "text-amber-600" },
                    ] as const
                  ).map(({ key, label, sub, Icon, tone }) => {
                    const active = stockAdjustType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setStockAdjustType(key);
                          setStockAdjustQty(
                            key === "RECONCILE" ? stockAdjustTarget.stock ?? 0 : 0,
                          );
                        }}
                        className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 transition-all cursor-pointer ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-wash)] shadow-xs"
                            : "border-black/10 bg-white hover:border-black/25"
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                            active
                              ? "border-[var(--accent)]/40 bg-white"
                              : "border-black/10 bg-black/[0.03]"
                          }`}
                        >
                          <Icon
                            className={`w-3.5 h-3.5 ${active ? "text-[var(--accent)]" : tone}`}
                          />
                        </span>
                        <span className="text-[10px] font-black text-black leading-tight">
                          {label}
                        </span>
                        <span
                          className={`text-[9px] font-bold leading-tight ${
                            sub.startsWith("+")
                              ? "text-emerald-600"
                              : sub.startsWith("−")
                                ? "text-red-600"
                                : "text-amber-600"
                          }`}
                        >
                          {sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Quantity */}
              <div
                className={`rounded-xl border p-3.5 transition-colors ${
                  stockAdjustType === "LOSS"
                    ? "border-red-200 bg-red-50/40"
                    : "border-[var(--accent)]/30 bg-[var(--accent-wash)]"
                }`}
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-2.5">
                  {stockAdjustType === "RECONCILE"
                    ? "New Counted Quantity"
                    : stockAdjustType === "LOSS"
                      ? "Quantity to Deduct"
                      : "Quantity to Add"}{" "}
                  <span className="text-red-500">*</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStockAdjustQty((q) => Math.max(0, q - 1))}
                    className="w-10 h-10 shrink-0 rounded-lg border border-black/15 bg-white hover:bg-black/5 flex items-center justify-center font-black text-lg cursor-pointer transition-colors"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={stockAdjustQty}
                    onChange={(e) =>
                      setStockAdjustQty(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="flex-1 min-w-0 text-center text-lg font-black text-black bg-white border border-black/15 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setStockAdjustQty((q) => q + 1)}
                    className="w-10 h-10 shrink-0 rounded-lg border border-black/15 bg-white hover:bg-black/5 flex items-center justify-center font-black text-lg cursor-pointer transition-colors"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-black/45 mr-0.5">
                    Quick:
                  </span>
                  {[1, 5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setStockAdjustQty((q) =>
                          stockAdjustType === "RECONCILE" ? n : q + n,
                        )
                      }
                      className="px-2 py-1 rounded-md border border-black/10 bg-white hover:border-[var(--accent)] hover:text-[var(--accent)] text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      {stockAdjustType === "RECONCILE" ? n : `+${n}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result preview */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-wash)] text-[11px] font-bold">
                <span className="text-black/55">
                  Current:{" "}
                  <span className="text-black font-black">
                    {stockAdjustTarget.stock ?? 0}
                  </span>
                  <span className="mx-1.5">→</span>
                  New Stock:{" "}
                  <span className="text-[var(--accent)] font-black">
                    {stockAdjustPreview}
                  </span>{" "}
                  units
                </span>
                <span
                  className={`font-black ${
                    stockAdjustDelta > 0
                      ? "text-emerald-600"
                      : stockAdjustDelta < 0
                        ? "text-red-600"
                        : "text-black/40"
                  }`}
                >
                  {stockAdjustDelta > 0 ? `+${stockAdjustDelta}` : stockAdjustDelta}
                </span>
              </div>

              {/* Note */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-1.5">
                  Adjustment Note{" "}
                  <span className="text-black/30 normal-case">(optional)</span>
                </p>
                <input
                  value={stockAdjustNote}
                  onChange={(e) => setStockAdjustNote(e.target.value)}
                  placeholder="e.g. Received new stock shipment"
                  className="w-full bg-white border border-black/15 rounded-lg px-3 py-2.5 text-sm font-semibold text-black placeholder:text-black/30 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 p-5 border-t border-black/10 bg-[#FAFAFA]">
              <button
                type="button"
                onClick={closeStockAdjust}
                disabled={isSavingStock}
                className="px-4 py-2.5 rounded-lg border border-black/15 bg-white hover:bg-black/5 text-[11px] font-black uppercase tracking-wider text-black cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStockAdjustment}
                disabled={isSavingStock}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors shadow-xs"
              >
                {isSavingStock ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {isSavingStock
                  ? "Updating..."
                  : `Update (${stockAdjustDelta > 0 ? `+${stockAdjustDelta}` : stockAdjustDelta})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-black/10">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[var(--accent)]" />
                <div>
                  <h3 className="text-base font-black text-black tracking-tight">
                    Manage Categories
                  </h3>
                  <p className="text-[10px] font-semibold text-black/50">
                    Create, rename or delete product categories
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategoryId(null);
                  setEditCategoryName("");
                  setNewCategoryName("");
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Add new category */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    New Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Sarees, Blouses, Fabrics"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCategory();
                    }}
                  />
                </div>
                <button
                  onClick={handleAddCategory}
                  disabled={isSavingCategory}
                  className="py-2.5 px-4 bg-[var(--accent)] hover:bg-[#27272A] text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingCategory ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add
                </button>
              </div>

              {/* Category list */}
              <div className="border border-black/10 rounded-lg divide-y divide-black/5 max-h-[320px] overflow-y-auto">
                {categories.length === 0 ? (
                  <div className="p-6 text-center text-xs font-semibold text-black/50">
                    No categories yet. Add your first one above.
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between gap-2 p-2.5"
                    >
                      {editingCategoryId === cat.id ? (
                        <>
                          <input
                            type="text"
                            className="flex-1 bg-white border border-black/15 focus:border-[var(--accent)] rounded-lg px-3 py-1.5 text-sm font-semibold text-black focus:outline-none"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEditCategory();
                            }}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEditCategory}
                            disabled={isSavingCategory}
                            className="text-[10px] font-bold text-white bg-[#16A34A] hover:bg-[#15803D] px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingCategoryId(null);
                              setEditCategoryName("");
                            }}
                            className="text-[10px] font-bold text-black/70 hover:text-black bg-black/5 hover:bg-black/10 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-black truncate">
                            {cat.name}
                          </span>
                          <button
                            onClick={() => {
                              setEditingCategoryId(cat.id);
                              setEditCategoryName(cat.name);
                            }}
                            className="text-[10px] font-bold text-[var(--accent)] hover:text-white hover:bg-[var(--accent)] border border-[var(--accent)]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-[10px] font-bold text-[#DC2626] hover:text-white hover:bg-[#DC2626] border border-[#DC2626]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-white border-b border-black/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-black tracking-tight">
                    {editingCatalogId
                      ? "Edit Catalog Item"
                      : newCatType === "SERVICE"
                        ? "Add New Service"
                        : "Add New Product"}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {editingCatalogId
                      ? "Modify item parameters"
                      : newCatType === "SERVICE"
                        ? "Register a chargeable service"
                        : "Set pricing, stock and category for this item"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  resetCatalogForm();
                  setEditingCatalogId(null);
                  setShowCatalogModal(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-white">
              {/* Product ⇄ Service switch */}
              <div>
                <p className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  Item Type
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCatType("PRODUCT")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer border ${
                      newCatType === "PRODUCT"
                        ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatType("SERVICE")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer border ${
                      newCatType === "SERVICE"
                        ? "bg-[var(--accent-strong)] text-white border-[var(--accent-strong)] shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Scissors className="w-4 h-4" />
                    Service
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 font-semibold mt-1.5">
                  {newCatType === "SERVICE"
                    ? "Services = delivery, packing, add-ons and other chargeable work. No stock is tracked."
                    : "Products = physical items sold. Stock and low-stock alerts are tracked."}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  {newCatType === "SERVICE" ? "Service Name" : "Product Name"}{" "}
                  <span className="text-[var(--accent)]">*</span>
                </label>
                <input
                  type="text"
                  placeholder={
                    newCatType === "SERVICE"
                      ? "e.g., Alteration Charges / Delivery"
                      : "e.g., Designer Silk Saree / Bridal Blouse"
                  }
                  className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder={
                    newCatType === "SERVICE"
                      ? "e.g., Includes stitching and finishing"
                      : "e.g., Pure Kanjeevaram Silk, Pink & Gold Zari, Size 38"
                  }
                  className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    Category
                  </label>
                  <input
                    type="text"
                    list="catalog-category-list"
                    placeholder="e.g., Blouses, Sarees, Services"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatCategory}
                    onChange={(e) => setNewCatCategory(e.target.value)}
                  />
                  <datalist id="catalog-category-list">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                  <p className="text-[9px] text-gray-400 font-semibold mt-1">
                    Pick an existing category or type a new one (it will be added automatically)
                  </p>
                </div>

                {/* Stock alerts exist only for physical products */}
                {newCatType === "PRODUCT" && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                      Low Stock Alert
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="5"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                      value={newCatLowStock}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setNewCatLowStock(
                          e.target.value === "" ? "" : parseFloat(e.target.value),
                        )
                      }
                    />
                    <p className="text-[9px] text-gray-400 font-semibold mt-1">
                      Warns you in Inventory when stock falls to this level.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    {newCatType === "SERVICE" ? "Service Price (₹)" : "Original Price (₹)"}{" "}
                    <span className="text-[var(--accent)]">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatPrice}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) =>
                      setNewCatPrice(
                        e.target.value === "" ? "" : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatCost}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) =>
                      setNewCatCost(
                        e.target.value === "" ? "" : parseFloat(e.target.value),
                      )
                    }
                  />
                </div>

                {newCatType === "PRODUCT" && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                      Current Stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[var(--accent)] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                      value={newCatStock}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setNewCatStock(
                          e.target.value === "" ? "" : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                )}
              </div>

              <p className="text-[9px] text-gray-400 font-semibold -mt-2">
                Cost price is for your records only — it is never used in billing.
              </p>

              {/* Automatic offer — applied whenever the item is added to a bill */}
              <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3.5 space-y-3">
                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  {newCatType === "SERVICE" ? "Service Offer" : "Product Special Offer"}{" "}
                  (Automatic on Billing)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900/70 uppercase tracking-widest mb-1.5">
                      Offer Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g. 10"
                      className="w-full bg-white border border-amber-200 focus:border-amber-400 rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors"
                      value={newCatOfferPct}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setNewCatOfferPct(
                          e.target.value === "" ? "" : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900/70 uppercase tracking-widest mb-1.5">
                      Discounted Offer Price (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder={
                        Number(newCatOfferPct) > 0
                          ? String(computedOfferPrice)
                          : "Offer Price"
                      }
                      className="w-full bg-white border border-amber-200 focus:border-amber-400 rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors"
                      value={newCatOfferPrice}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setNewCatOfferPrice(
                          e.target.value === "" ? "" : parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <p className="text-[9px] text-amber-800/80 font-semibold">
                  Whenever this {newCatType === "SERVICE" ? "service" : "product"} is
                  added to a bill, the offer price is applied automatically and shown
                  on the invoice.
                </p>
              </div>

              {/* Visibility in the Billing Panel */}
              <button
                type="button"
                onClick={() => setNewCatActive((prev) => !prev)}
                className="w-full flex items-center gap-3 border border-gray-200 hover:border-gray-300 rounded-xl px-3.5 py-3 cursor-pointer transition-colors text-left"
              >
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                    newCatActive
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                      : "bg-white border-gray-300 text-transparent"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold text-gray-700">
                  Active (visible in Billing Panel)
                </span>
              </button>

              <button
                onClick={addToCatalog}
                disabled={isSavingCatalog}
                className="w-full py-3.5 mt-2 bg-[var(--accent)] hover:bg-[#27272A] text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingCatalog ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PackagePlus className="w-4 h-4" />
                )}
                {editingCatalogId
                  ? "Save Changes"
                  : newCatType === "SERVICE"
                    ? "Save Service"
                    : "Save Product to Catalog"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile/Tablet Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Collapsible Left Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 bottom-0 left-0 bg-gradient-to-b from-[var(--accent)] via-[var(--accent-strong)] to-[color-mix(in_srgb,var(--accent)_55%,#000000)] text-[#FFFFFF] flex flex-col justify-between h-screen shrink-0 shadow-2xl z-40 transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-64 border-r border-white/20 translate-x-0" : "w-0 min-w-0 border-r-0 -translate-x-64 overflow-hidden"}`}
      >
        <div className="w-64 flex flex-col justify-between h-full shrink-0 overflow-hidden relative">
          <div className="flex flex-col">
            {/* Header branding */}
            <div className="p-6 border-b border-white/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md overflow-hidden shrink-0 border border-white/25">
                  <img
                    src={shopSettings.logo_data_url || "/logo.png"}
                    alt={`${shopSettings.shop_name} Logo`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <span className="font-black text-sm tracking-tight text-[#FFFFFF] block leading-tight">
                    {shopSettings.shop_name}
                  </span>
                  <span className="text-[9px] text-white/80 font-bold tracking-wider block mt-0.5">
                    {shopSettings.tagline}
                  </span>
                </div>
              </div>

              {/* Close Button Inside Sidebar */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white font-bold hover:text-white transition-all cursor-pointer"
                title="Close Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="px-4 py-6 space-y-2">
              <button
                onClick={() => {
                  setActiveTab("billing");
                  setCompletedBillData(null);
                  if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  activeTab === "billing"
                    ? "bg-white text-[#27272A] shadow-md"
                    : "text-white/90 hover:bg-white/20 hover:text-white"
                }`}
              >
                <Receipt className="w-5 h-5 shrink-0" />
                Billing Panel
              </button>
              <button
                onClick={() => {
                  setActiveTab("advance");
                  setCompletedBillData(null);
                  if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer relative ${
                  activeTab === "advance"
                    ? "bg-white text-[#27272A] shadow-md"
                    : "text-white/90 hover:bg-white/20 hover:text-white"
                }`}
              >
                <Clock className="w-5 h-5 shrink-0" />
                Advance Orders
                {advanceOrders.filter((a) => a.status === "PENDING" || a.status === "READY").length > 0 && (
                  <span className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black flex items-center justify-center bg-[#F59E0B] text-white">
                    {advanceOrders.filter((a) => a.status === "PENDING" || a.status === "READY").length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("orders");
                  setCompletedBillData(null);
                  if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  activeTab === "orders"
                    ? "bg-white text-[#27272A] shadow-md"
                    : "text-white/90 hover:bg-white/20 hover:text-white"
                }`}
              >
                <History className="w-5 h-5 shrink-0" />
                Order History
              </button>
              {role === "admin" && (
                <button
                  onClick={openInventory}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "inventory"
                      ? "bg-white text-[#27272A] shadow-md"
                      : "text-white/90 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  <Boxes className="w-5 h-5 shrink-0" />
                  Inventory
                </button>
              )}
              {role === "admin" && (
                <button
                  onClick={() => {
                    setActiveTab("analytics");
                    setCompletedBillData(null);
                    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "analytics"
                      ? "bg-white text-[#27272A] shadow-md"
                      : "text-white/90 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  <BarChart2 className="w-5 h-5 shrink-0" />
                  Analytics Dashboard
                </button>
              )}
              {role === "admin" && (
                <button
                  onClick={() => {
                    setActiveTab("expenses");
                    setCompletedBillData(null);
                    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "expenses"
                      ? "bg-white text-[#27272A] shadow-md"
                      : "text-white/90 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  <Wallet className="w-5 h-5 shrink-0" />
                  Expense Tracker
                </button>
              )}
              {role === "admin" && (
                <button
                  onClick={() => {
                    setActiveTab("settings");
                    setCompletedBillData(null);
                    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "settings"
                      ? "bg-white text-[#27272A] shadow-md"
                      : "text-white/90 hover:bg-white/20 hover:text-white"
                  }`}
                >
                  <Settings2 className="w-5 h-5 shrink-0" />
                  Settings
                </button>
              )}

              <div className="pt-4 border-t border-white/20 mt-4">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-white/10 hover:bg-white/25 hover:shadow-md border border-white/20 transition-all cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  Log Out
                </button>
              </div>
            </nav>
          </div>

          {/* Footer branding */}
          <div className="p-5 border-t border-white/20 bg-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white font-black text-xs uppercase">
              {role === "admin" ? "A" : "S"}
            </div>
            <div>
              <span className="text-xs font-bold text-white block uppercase tracking-wider">
                {role === "admin" ? "Admin Access" : "Staff Access"}
              </span>
              <span className="text-[9px] text-white/80 font-bold tracking-wider block">
                V2.1.0 • PREMIUM POS
              </span>
            </div>
          </div>
        </div>
      </aside>
      {/* Main Content Area */}
      <main
        ref={mainScrollRef}
        className="flex-1 h-screen overflow-y-auto overflow-x-hidden min-w-0 px-3 sm:px-8 lg:px-12 pt-3 pb-8 relative flex flex-col animate-in fade-in duration-300"
      >
        {/* Global Top Navbar */}
        <header className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-black/10 w-full mb-6 gap-4">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="w-9 h-9 bg-white border border-black/10 hover:bg-[#FFFFFF]/40 rounded-lg flex items-center justify-center transition-all shadow-sm cursor-pointer"
                title="Open Menu"
              >
                <Menu className="w-4.5 h-4.5 text-[var(--accent)]" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-black text-[#000000] tracking-tight">
                {shopSettings.shop_name}
              </h1>
            </div>
          </div>

          {/* OFFLINE / ONLINE Toggle (only shown when billing tab is active) */}
          {activeTab === "billing" && (
            <div className="flex items-center bg-[#FFFFFF]/60 border border-black/10 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setIsOnline(false)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all uppercase cursor-pointer ${!isOnline ? "bg-[#27272A] text-[#FFFFFF] shadow-sm" : "text-[#000000] hover:text-[#000000]"}`}
              >
                <span className="w-2 h-2 rounded-full bg-[#27272A]"></span>
                OFFLINE (POS)
              </button>
              <button
                onClick={() => setIsOnline(true)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all uppercase cursor-pointer ${isOnline ? "bg-[#00A86B] text-[#FFFFFF] shadow-sm" : "text-[#000000] hover:text-[#000000]"}`}
              >
                <span className="w-2 h-2 rounded-full bg-[#00A86B]"></span>
                ONLINE ORDER
              </button>
            </div>
          )}
        </header>

        {/* Bill Generated — shown as a modal over the billing screen (not a new page) */}
        {completedBillData && (
          <div className="fixed inset-0 z-[390] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex flex-col gap-4 w-full max-w-[640px] min-w-0 bg-white rounded-2xl shadow-2xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              {/* Header Bar */}
              <div className="flex justify-between items-center pb-2 border-b border-black/10">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black text-[#000000] tracking-tight">
                      Bill Generated
                    </h1>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${completedBillData.isGst ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-black/5 text-[#111827]"}`}
                    >
                      {completedBillData.isGst ? "GST" : "Non-GST"}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono font-bold text-[var(--accent)] mt-0.5">
                    #{completedBillData.id}
                  </p>
                </div>
                <button
                  onClick={() => setCompletedBillData(null)}
                  className="bg-black hover:bg-black/80 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Sale
                </button>
              </div>

              {/* Payment Receipt Card */}
              <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
                <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 flex justify-between items-center">
                  <span>Payment Receipt</span>
                  <span className="text-[9px] font-black text-[var(--accent)] bg-black/5 px-2 py-0.5 rounded">
                    {completedBillData.paymentMode === "SPLIT"
                      ? "Split · Cash + GPay"
                      : completedBillData.paymentMode === "GPAY"
                        ? "GPay"
                        : "Cash"}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-600">
                    Grand Total
                  </span>
                  <span className="text-xl font-black text-black">
                    ₹
                    {completedBillData.grandTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {completedBillData.paymentMode === "SPLIT" && (
                  <>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-600">
                        Paid by Cash
                      </span>
                      <span className="text-sm font-bold text-black">
                        ₹
                        {(completedBillData.splitCash || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-600">
                        Paid by GPay
                      </span>
                      <span className="text-sm font-bold text-black">
                        ₹
                        {(completedBillData.splitGpay || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-600">
                    {completedBillData.paymentMode === "GPAY"
                      ? "Paid via GPay"
                      : completedBillData.paymentMode === "SPLIT"
                        ? "Total Received"
                        : "Amount Received"}
                  </span>
                  <span className="text-sm font-black text-black">
                    ₹
                    {(
                      completedBillData.cashReceived ||
                      completedBillData.grandTotal
                    ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Balance Returned Box — cash change only */}
                {completedBillData.paymentMode !== "GPAY" && (
                  <div className="bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg p-3 sm:p-3.5 flex justify-between items-center mt-1">
                    <span className="text-xs font-bold text-[var(--accent-strong)]">
                      Balance Returned
                    </span>
                    <span className="text-base sm:text-lg font-black text-[var(--accent-strong)]">
                      ₹
                      {Math.max(
                        0,
                        (completedBillData.cashReceived || 0) -
                          completedBillData.grandTotal,
                      ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => setPrintModalData({ id: completedBillData.id, type: "invoice" })}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Print Receipt
                </button>
                <button
                  onClick={() => setActiveInvoiceId(completedBillData.id)}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
                  View
                </button>
                <button
                  onClick={() => resendWhatsApp(completedBillData)}
                  className="bg-[#10B981] hover:bg-[#059669] text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                  </svg>
                  WhatsApp Invoice
                </button>
                <button
                  onClick={() => setCompletedBillData(null)}
                  className="bg-black hover:bg-black/80 text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Sale
                </button>
              </div>

              {/* Items Sold Card */}
              <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
                <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
                  Items Sold
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {completedBillData.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center text-xs py-1 border-b border-gray-50 last:border-none"
                    >
                      <span className="font-semibold text-black">
                        {item.name}{" "}
                        <span className="text-gray-400 font-bold text-[10px] ml-1">
                          × {item.qty} {item.qty === 1 ? "piece" : "pieces"}
                        </span>
                      </span>
                      <span className="font-bold text-black">
                        ₹
                        {(item.price * item.qty).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Advance Order created — shareable receipt modal ─────── */}
        {advanceReceipt && (
          <div className="fixed inset-0 z-[395] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex flex-col gap-4 w-full max-w-[520px] min-w-0 bg-white rounded-2xl shadow-2xl p-4 sm:p-5 max-h-[94vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center pb-2 border-b border-black/10">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black text-[#000000] tracking-tight">
                      Advance Order Saved
                    </h1>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                      Deposit
                    </span>
                  </div>
                  <p className="text-[11px] font-mono font-bold text-[var(--accent)] mt-0.5">
                    #{advanceReceipt.id}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setAdvanceReceipt(null);
                    setActiveTab("advance");
                  }}
                  className="bg-black hover:bg-black/80 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Sale
                </button>
              </div>

              {/* Deposit Receipt Card */}
              <div className="bg-white rounded-xl p-4 sm:p-5 border border-black/10 shadow-xs space-y-3">
                <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">
                  Advance Receipt — {advanceReceipt.customerName}
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-600">Order Total</span>
                  <span className="text-lg font-black text-black">
                    ₹{advanceReceipt.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-600">Deposit Paid</span>
                  <span className="text-sm font-black text-[#166534]">
                    ₹{advanceReceipt.deposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-[#FEE2E2] border border-[#DC2626]/30 rounded-lg p-3 sm:p-3.5 flex justify-between items-center mt-1">
                  <span className="text-xs font-bold text-[#991B1B]">Balance Due</span>
                  <span className="text-base sm:text-lg font-black text-[#991B1B]">
                    ₹{advanceReceipt.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => printAdvanceReceipt(advanceReceipt.id)}
                  className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Print Receipt
                </button>
                <button
                  onClick={() => shareAdvanceReceiptWhatsApp(advanceReceipt)}
                  className="bg-[#10B981] hover:bg-[#059669] text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => {
                    setAdvanceReceipt(null);
                    setActiveTab("advance");
                  }}
                  className="bg-black hover:bg-black/80 text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Sale
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "billing" && (
            <div className="flex-1 flex flex-col gap-6 max-w-[1400px] min-w-0 mx-auto w-full">
              {/* Subheader Accent Bar and Title */}
              <div className="flex justify-between items-center py-2 border-b border-black/10 w-full">
                <div className="flex items-center gap-4">
                  <span className="w-1.5 h-8 bg-[var(--accent)] rounded-full"></span>
                  <div>
                    <h2 className="text-xl font-black text-[#000000] tracking-tight">
                      POS Billing Panel
                    </h2>
                    <p className="text-[11px] text-[#000000] font-semibold mt-0.5">
                      Quick Invoice generator & database synced checkout
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid Layout */}
              <div className="flex flex-col lg:flex-row gap-8 w-full">
                {/* Left Column */}
                <div className="w-full lg:w-[60%] xl:w-[65%] flex flex-col gap-6 h-auto lg:h-full">
                  {/* Customer Details */}
                  <div className="flex-shrink-0 bg-white border border-black/10 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 relative overflow-hidden group">
                    <h2 className="text-base font-black flex items-center gap-3 text-[#000000] mb-6 tracking-tight">
                      <User className="w-4 h-4 text-[var(--accent)]" />
                      Customer Details
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                          Customer Name
                        </label>
                        <input
                          type="text"
                          placeholder="Walk-in Customer"
                          className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[var(--accent)] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-semibold focus:outline-none transition-colors placeholder:text-[#000000] placeholder:font-normal shadow-sm"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                          Mobile Number (WhatsApp)
                        </label>
                        <input
                          type="tel"
                          placeholder="Enter 10-digit number"
                          maxLength={10}
                          className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[var(--accent)] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-semibold focus:outline-none transition-colors placeholder:text-[#000000] placeholder:font-normal shadow-sm"
                          value={customerPhone}
                          onChange={(e) =>
                            setCustomerPhone(
                              e.target.value.replace(/\D/g, "").slice(0, 10),
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                            Bill Date
                          </span>
                          <span className="text-[9px] text-[var(--accent)] font-extrabold uppercase">
                            Custom / Past
                          </span>
                        </label>
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[var(--accent)] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-bold focus:outline-none transition-colors cursor-pointer shadow-sm"
                          value={customOrderDate}
                          onChange={(e) => setCustomOrderDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mt-6">
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                        Customer Address (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Enter full address"
                        className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[var(--accent)] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-semibold focus:outline-none transition-colors placeholder:text-[#000000] placeholder:font-normal shadow-sm"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Order Items Ledger */}
                  <div className="flex-1 bg-white border border-black/10 rounded-xl shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 flex flex-col overflow-visible">
                    <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-6 pt-4 sm:pt-6 pb-2 border-b border-transparent gap-4">
                      <h2 className="text-base font-black flex items-center gap-3 text-[#000000] tracking-tight">
                        <Receipt className="w-4 h-4 text-[var(--accent)]" />
                        Order Items
                      </h2>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                        <button
                          onClick={clearOrder}
                          className="text-[10px] font-bold text-[#000000] bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-black/10 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear Order
                        </button>
                        <button
                          onClick={() => {
                            resetCatalogForm();
                            setNewCatType("SERVICE");
                            setCatalogTargetRowId(null);
                            setShowCatalogModal(true);
                          }}
                          className="text-[10px] font-bold text-[var(--accent-strong)] bg-[var(--accent-strong)]/5 hover:bg-[var(--accent-strong)]/10 border border-[var(--accent-strong)]/20 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" /> Add Service
                        </button>
                        <button
                          onClick={() => {
                            resetCatalogForm();
                            setNewCatType("PRODUCT");
                            setCatalogTargetRowId(null);
                            setShowCatalogModal(true);
                          }}
                          className="text-[10px] font-bold text-[#000000] bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-black/10 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <PackagePlus className="w-3.5 h-3.5 text-[var(--accent)]" />{" "}
                          Add To Catalog
                        </button>
                        <button
                          onClick={addItem}
                          className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Custom Item
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 overflow-visible">
                      {/* Table Header */}
                      <div className="hidden sm:grid grid-cols-12 gap-4 pb-3 border-b border-black/10 text-[9px] font-black text-[#000000] uppercase tracking-[0.15em] mt-4 mb-2">
                        <div className="col-span-7 pl-2">
                          Item Name / Description
                        </div>
                        <div className="col-span-2 text-center">Price (₹)</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-1"></div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-4 pt-2 overflow-visible">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 items-stretch sm:items-center group border-b border-transparent pb-4 pt-1 overflow-visible relative"
                          >
                            {/* Item Name / Description Input + Catalog Button */}
                            <div className="col-span-7 relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                              <input
                                type="text"
                                placeholder="Type custom item name..."
                                className="flex-1 bg-white border border-black/10 focus:border-[var(--accent)] rounded-lg px-4 py-2 text-xs font-semibold text-[#000000] focus:outline-none transition-colors placeholder:text-[#000000] min-w-0"
                                value={item.name}
                                onChange={(e) =>
                                  updateItem(item.id, "name", e.target.value)
                                }
                              />
                              <button
                                onClick={() => {
                                  setActiveCatalogRowId(
                                    activeCatalogRowId === item.id
                                      ? null
                                      : item.id,
                                  );
                                  setCatalogSearch("");
                                }}
                                className="flex items-center justify-center gap-1.5 border border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors uppercase tracking-wider shrink-0 cursor-pointer w-full sm:w-auto"
                              >
                                <List className="w-3.5 h-3.5" />
                                Catalog
                              </button>

                              {/* Automatic offer applied to this line */}
                              {(item.offerPct ?? 0) > 0 && (
                                <span className="absolute -top-1 right-0 sm:right-[calc(100%+0.5rem)] text-[9px] font-black uppercase tracking-widest text-[#15803D] bg-[#15803D]/10 border border-[#15803D]/30 px-1.5 py-0.5 rounded">
                                  Offer −{item.offerPct}% applied
                                </span>
                              )}

                              {/* Catalog Dropdown Popover */}
                              {activeCatalogRowId === item.id && (
                                <div className="absolute z-[80] top-full left-0 mt-1 w-full sm:w-80 max-w-[calc(100vw-2.5rem)] bg-[#FFFFFF] border-2 border-black/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                  <div className="p-2 border-b border-black/10 bg-[#FFFFFF] space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <input
                                        type="text"
                                        placeholder="Search catalog items..."
                                        className="w-full bg-white border border-black/10 focus:border-[var(--accent)] rounded-md px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors"
                                        value={catalogSearch}
                                        onChange={(e) =>
                                          setCatalogSearch(e.target.value)
                                        }
                                        autoFocus
                                      />
                                      <button
                                        onClick={() =>
                                          setActiveCatalogRowId(null)
                                        }
                                        className="text-[#000000] hover:text-tertiary cursor-pointer"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <select
                                      value={activeCategory}
                                      onChange={(e) =>
                                        setActiveCategory(e.target.value)
                                      }
                                      className="w-full bg-white border border-black/10 focus:border-[var(--accent)] rounded-md px-3 py-1.5 text-xs font-bold text-[#000000] focus:outline-none transition-colors cursor-pointer"
                                    >
                                      <option value="ALL">All categories</option>
                                      {categories.map((c) => (
                                        <option key={c.id} value={c.name}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    {(() => {
                                      const list = catalog.filter(
                                        (c) =>
                                          (activeCategory === "ALL" ||
                                            (c.category || "General") ===
                                              activeCategory) &&
                                          (c.isActive === undefined ||
                                            c.isActive) &&
                                          c.name
                                            .toLowerCase()
                                            .includes(
                                              catalogSearch.toLowerCase(),
                                            ),
                                      );
                                      return list.length > 0 ? (
                                        list.map((catItem) => {
                                          return (
                                            <div
                                              key={catItem.id}
                                              className="w-full flex items-center border-b border-transparent last:border-0 hover:bg-[#FFFFFF] transition-colors"
                                            >
                                              <button
                                                className="flex-1 text-left px-4 py-2.5 flex flex-col cursor-pointer"
                                                onClick={() => {
                                                  updateItem(
                                                    item.id,
                                                    "name",
                                                    catItem.name,
                                                  );
                                                  updateItem(
                                                    item.id,
                                                    "desc",
                                                    catItem.desc || "",
                                                  );
                                                  updateItem(
                                                    item.id,
                                                    "product_id",
                                                    catItem.productId ||
                                                      catItem.id,
                                                  );
                                                  const onOffer =
                                                    (catItem.offerPct ?? 0) > 0 &&
                                                    (catItem.offerPrice ?? 0) > 0;
                                                  if (catItem.price !== undefined) {
                                                    updateItem(
                                                      item.id,
                                                      "price",
                                                      onOffer
                                                        ? (catItem.offerPrice as number)
                                                        : catItem.price,
                                                    );
                                                  }
                                                  updateItem(
                                                    item.id,
                                                    "offerPct",
                                                    onOffer
                                                      ? (catItem.offerPct as number)
                                                      : 0,
                                                  );
                                                  setActiveCatalogRowId(null);
                                                }}
                                              >
                                                <div className="flex justify-between items-center w-full">
                                                  <span className="text-xs font-bold text-[#000000] flex items-center gap-1.5">
                                                    {catItem.name}
                                                    {catItem.itemType === "SERVICE" && (
                                                      <span className="text-[8px] font-black uppercase tracking-widest text-[var(--accent-strong)] bg-[var(--accent-strong)]/10 border border-[var(--accent-strong)]/25 px-1.5 py-0.5 rounded">
                                                        Service
                                                      </span>
                                                    )}
                                                    {(catItem.offerPct ?? 0) > 0 && (
                                                      <span className="text-[8px] font-black uppercase tracking-widest text-[#15803D] bg-[#15803D]/10 border border-[#15803D]/25 px-1.5 py-0.5 rounded">
                                                        −{catItem.offerPct}%
                                                      </span>
                                                    )}
                                                  </span>
                                                </div>
                                                {catItem.desc && (
                                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#000000] mt-0.5">
                                                    {catItem.desc}
                                                  </span>
                                                )}
                                                {catItem.price !==
                                                  undefined && (
                                                  <span className="text-[10px] font-bold text-[var(--accent)] mt-0.5">
                                                    ₹{catItem.price}
                                                  </span>
                                                )}
                                              </button>
                                              <div className="flex shrink-0">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditCatalog(
                                                      catItem,
                                                      item.id,
                                                    );
                                                    setActiveCatalogRowId(null);
                                                  }}
                                                  className="px-3 py-2.5 text-[#000000] hover:text-[var(--accent)] transition-colors cursor-pointer"
                                                  title="Edit item"
                                                >
                                                  <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (
                                                      window.confirm(
                                                        "Are you sure you want to delete this item from the catalog?",
                                                      )
                                                    ) {
                                                      deleteFromCatalog(
                                                        catItem.id,
                                                      );
                                                    }
                                                  }}
                                                  className="px-3 py-2.5 text-[#000000] hover:text-tertiary transition-colors cursor-pointer"
                                                  title="Delete item"
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="px-4 py-4 text-center">
                                          <div className="text-xs text-[#000000] font-semibold mb-2">
                                            No items match "{catalogSearch}"
                                          </div>
                                          <button
                                            onClick={() => {
                                              setNewCatName(catalogSearch);
                                              setCatalogTargetRowId(item.id);
                                              setShowCatalogModal(true);
                                              setActiveCatalogRowId(null);
                                            }}
                                            className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 px-3 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                                          >
                                            + Add to Catalog
                                          </button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Price, Qty, and Trash (Grid on mobile to prevent overflow, grid on desktop) */}
                            <div className="col-span-5 grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-5 gap-2 sm:gap-4 w-full items-center">
                              {/* Price Input */}
                              <div className="sm:col-span-2 flex items-center gap-1.5 sm:gap-2 sm:block min-w-0 w-full">
                                <span className="text-[10px] font-bold text-[#000000] uppercase sm:hidden shrink-0">
                                  Price:
                                </span>
                                <input
                                  type="number"
                                  className="w-full min-w-0 text-center bg-white border border-black/10 focus:border-[var(--accent)] rounded-lg px-2 sm:px-3 py-2 text-xs font-semibold text-[#000000] focus:outline-none transition-colors"
                                  value={item.price || ""}
                                  onChange={(e) =>
                                    updateItem(
                                      item.id,
                                      "price",
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onWheel={(e) => e.currentTarget.blur()}
                                  placeholder="0"
                                />
                              </div>

                              {/* Quantity Counter */}
                              <div className="sm:col-span-2 flex items-center justify-end gap-1.5 sm:gap-2 sm:block shrink-0">
                                <span className="text-[10px] font-bold text-[#000000] uppercase sm:hidden shrink-0">
                                  Qty:
                                </span>
                                <div className="flex items-center border border-black/10 bg-white rounded-lg overflow-hidden h-[36px] max-w-[90px] shrink-0">
                                  <button
                                    className="w-7 h-full flex items-center justify-center text-[#000000] hover:bg-[#FFFFFF] hover:text-tertiary font-bold text-xs transition-colors cursor-pointer"
                                    onClick={() =>
                                      handleQtyChange(item.id, item.qty - 1)
                                    }
                                  >
                                    −
                                  </button>
                                  <span className="flex-1 text-center font-bold text-xs text-[#000000] min-w-[18px]">
                                    {item.qty}
                                  </span>
                                  <button
                                    className="w-7 h-full flex items-center justify-center text-[#000000] hover:bg-[#FFFFFF] hover:text-tertiary font-bold text-xs transition-colors cursor-pointer"
                                    onClick={() =>
                                      handleQtyChange(item.id, item.qty + 1)
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Trash Button */}
                              <div className="sm:col-span-1 flex justify-end shrink-0">
                                <button
                                  onClick={() => removeItem(item.id)}
                                  className="text-[#000000] hover:text-[#27272A] hover:bg-[#F4F4F5] p-2 rounded-lg border border-black/10 hover:border-transparent transition-colors flex items-center justify-center cursor-pointer"
                                  title="Remove Item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>{" "}
                {/* Right Column - Premium Light Order Panel */}
                <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col shrink-0 bg-white text-[#000000] border border-black/10 rounded-2xl shadow-sm lg:sticky lg:top-28 lg:self-start transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 overflow-hidden group">
                  <div className="p-4 sm:p-6 pb-4 border-b border-black/10 flex justify-between items-center bg-[#FFFFFF]">
                    <h2 className="text-base font-black flex items-center gap-3 text-[#000000] tracking-tight">
                      <ShoppingBag className="w-4 h-4 text-[var(--accent)]" />
                      Current Order
                    </h2>
                    <span
                      className={`flex items-center gap-2 bg-white border border-black/10 px-3 py-1 rounded-full font-bold text-[9px] ${isOnline ? "text-[#00A86B]" : "text-[#27272A]"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-[#00A86B]" : "bg-[#27272A]"}`}
                      ></span>
                      {isOnline ? "ONLINE ORDER" : "OFFLINE (POS)"}
                    </span>
                  </div>

                  <div className="p-4 sm:p-6 space-y-5">
                    {/* Customer Details Box */}
                    <div className="bg-[#FFFFFF]/40 border border-black/10 rounded-xl p-4 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#000000] font-semibold">
                          SOURCE
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${isOnline ? "border-[#00A86B] text-[#00A86B] bg-[#00A86B]/10" : "border-[#27272A] text-[#27272A] bg-[#27272A]/10"}`}
                        >
                          {isOnline ? "ONLINE" : "OFFLINE"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#000000] font-semibold">
                          CUSTOMER
                        </span>
                        <span className="font-bold text-[#000000] truncate max-w-[65%] text-right">
                          {customerName || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#000000] font-semibold">
                          PHONE
                        </span>
                        <span className="font-bold text-[#000000]">
                          {customerPhone || "-"}
                        </span>
                      </div>

                      {/* Items summary list inside customer details box */}
                      <div className="border-t border-black/10 pt-2.5 mt-2.5">
                        {items.filter((i) => i.name).length === 0 ? (
                          <div className="text-center py-2 text-[10px] text-[#000000] font-semibold italic">
                            No items added yet
                          </div>
                        ) : (
                          <div className="max-h-24 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                            {items
                              .filter((i) => i.name)
                              .map((item) => (
                                <div
                                  key={item.id}
                                  className="flex justify-between items-center text-[10px]"
                                >
                                  <span className="text-[#000000] font-semibold">
                                    {item.qty}x {item.name}
                                  </span>
                                  <span className="font-bold text-[var(--accent)]">
                                    ₹
                                    {(item.price * item.qty).toLocaleString(
                                      undefined,
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Discounts section */}
                    <div className="space-y-4 pt-1">
                      {/* Manual Discount */}
                      <div>
                        <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.1em] mb-1.5">
                          Manual Discount
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={discountType}
                            onChange={(e) => {
                              setDiscountType(
                                e.target.value as "fixed" | "percent",
                              );
                              setSelectedCoupon("none");
                            }}
                            className="bg-white border border-black/10 text-[#000000] rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                          >
                            <option value="fixed">₹</option>
                            <option value="percent">%</option>
                          </select>
                          <input
                            type="number"
                            className="flex-1 text-right bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
                            value={discountValue || ""}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => {
                              setDiscountValue(parseFloat(e.target.value) || 0);
                              setSelectedCoupon("none");
                            }}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Subtotal & Delivery Breakdown */}
                      <div className="space-y-2.5 pt-2 border-t border-black/10">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-[#000000]">
                            Subtotal (
                            {items
                              .filter((i) => i.name)
                              .reduce((sum, i) => sum + i.qty, 0)}{" "}
                            items)
                          </span>
                          <span className="font-bold text-[#000000]">
                            ₹
                            {subtotal.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-[#000000]">Delivery</span>
                          <input
                            type="number"
                            className="w-20 text-right bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none focus:border-[var(--accent)]"
                            value={deliveryFee || ""}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              setDeliveryFee(parseFloat(e.target.value) || 0)
                            }
                            placeholder="0"
                          />
                        </div>

                        {/* Bill Type: GST Invoice vs Non-GST Bill */}
                        <div className="pt-2 space-y-2.5">
                          <div className="flex items-center bg-[#FFFFFF] border border-black/10 rounded-full p-1 w-full">
                            <button
                              type="button"
                              onClick={() => setGstBill(false)}
                              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${!applyGST ? "bg-[#111827] text-white shadow-sm" : "text-[#000000]"}`}
                            >
                              Non-GST Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => setGstBill(true)}
                              className={`flex-1 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${applyGST ? "bg-[var(--accent)] text-white shadow-sm" : "text-[#000000]"}`}
                            >
                              GST Invoice
                            </button>
                          </div>
                          {applyGST && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-[#000000] uppercase tracking-wider">
                                GST <span className="text-[9px] font-bold text-[var(--accent-strong)]">(+ extra)</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    className="w-14 text-right bg-white border border-black/10 rounded-lg px-2 py-1 text-xs font-bold text-[#000000] focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={gstPercentage || ""}
                                    onChange={(e) =>
                                      setGstPercentage(
                                        parseFloat(e.target.value) || 0,
                                      )
                                    }
                                    placeholder="%"
                                  />
                                  <span className="text-xs font-bold text-[#000000]">
                                    %
                                  </span>
                                </div>
                                <span className="text-xs font-bold text-[var(--accent)] w-20 text-right">
                                  ₹
                                  {gstAmount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Financial Option — payment method */}
                      <div className="pt-2 space-y-1.5">
                        <span className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider">
                          Financial Option
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {POS_PAYMENT_MODES.map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPaymentMode(mode)}
                              className={`py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer border ${
                                paymentMode === mode
                                  ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                                  : "bg-white text-[#000000] border-black/10 hover:border-[var(--accent)]"
                              }`}
                            >
                              {mode === "GPAY" ? "GPay" : mode === "SPLIT" ? "Split" : mode}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Grand Total */}
                      <div className="flex justify-between items-center text-sm font-bold pt-4 border-t border-black/10">
                        <span className="text-[#000000] uppercase tracking-wider">
                          Grand Total
                        </span>
                        <span className="text-xl text-[var(--accent)] font-black">
                          ₹
                          {grandTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      {/* Payment inputs — per selected method */}
                      {paymentMode === "SPLIT" ? (
                        <div className="bg-[#FFFFFF]/40 border border-black/10 rounded-xl p-4 mt-2 space-y-3">
                          <span className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider">
                            Split Payment
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-[#000000] mb-1.5">
                                Cash (₹)
                              </label>
                              <input
                                type="number"
                                className="w-full bg-white border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-2 text-base font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none transition-colors"
                                value={splitCash || ""}
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) =>
                                  setSplitCash(parseFloat(e.target.value) || 0)
                                }
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[#000000] mb-1.5">
                                GPay (₹)
                              </label>
                              <input
                                type="number"
                                className="w-full bg-white border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-2 text-base font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none transition-colors"
                                value={splitGpay || ""}
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) =>
                                  setSplitGpay(parseFloat(e.target.value) || 0)
                                }
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-1 border-t border-black/10">
                            <span className="font-bold text-[#000000] uppercase tracking-[0.05em]">
                              Total Received
                            </span>
                            <span className="font-black text-sm text-[var(--accent)]">
                              ₹
                              {(splitCash + splitGpay).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                          {splitCash + splitGpay < grandTotal ? (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-[#000000] uppercase tracking-[0.05em]">
                                Balance Remaining
                              </span>
                              <span className="font-black text-sm text-[#DC2626]">
                                ₹
                                {(grandTotal - (splitCash + splitGpay)).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-[#000000] uppercase tracking-[0.05em]">
                                Change to Return
                              </span>
                              <span className="font-black text-sm text-[#00A86B]">
                                ₹
                                {(splitCash + splitGpay - grandTotal).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#FFFFFF]/40 border border-black/10 rounded-xl p-4 mt-2">
                          <span className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-0.5">
                            {paymentMode === "CASH" ? "Cash Payment" : "GPay Payment"}
                          </span>
                          <label className="block text-[10px] font-bold text-[#000000] mb-2.5">
                            {paymentMode === "CASH" ? "Amount Received (₹)" : "GPay Amount (₹)"}
                          </label>
                          <input
                            type="number"
                            className="w-full bg-white border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-2 text-base font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none transition-colors"
                            value={cashReceived || ""}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) =>
                              setCashReceived(parseFloat(e.target.value) || 0)
                            }
                            placeholder="0.00"
                          />
                        </div>
                      )}

                      {/* Change Return — cash only */}
                      {paymentMode === "CASH" && cashReceived > 0 && (
                        <div className="flex justify-between items-center bg-white border border-black/10 rounded-lg p-3 text-xs">
                          <span className="font-bold text-[#000000] uppercase tracking-[0.05em]">
                            Change Return
                          </span>
                          <span
                            className={`font-black text-sm ${cashReceived >= grandTotal ? "text-[#00A86B]" : "text-[#27272A]"}`}
                          >
                            ₹
                            {Math.max(
                              0,
                              cashReceived - grandTotal,
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}

                      {/* Complete Sale — saves the order to the database */}
                      <button
                        onClick={() => completeSale()}
                        disabled={isSubmittingOrder}
                        className={`w-full mt-2 bg-[var(--accent)] hover:bg-[#27272A] text-white py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-[0_4px_14px_rgba(63,63,70,0.35)] ${
                          isSubmittingOrder
                            ? "opacity-60 cursor-not-allowed"
                            : "cursor-pointer"
                        }`}
                      >
                        {isSubmittingOrder ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Processing Sale...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Complete Sale</span>
                          </>
                        )}
                      </button>

                      {/* Save as Advance Order — partial payment hold, not counted as revenue */}
                      <button
                        onClick={openAdvanceSaveModal}
                        disabled={isSubmittingOrder}
                        className={`w-full mt-2 bg-white border-2 border-[#F59E0B] hover:bg-[#FEF3C7] text-[#B45309] py-3 rounded-lg font-black text-[10px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                          isSubmittingOrder ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        <span>Save as Advance Order</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* ── Save-as-Advance modal (opens from billing) ─────────── */}
        {showAdvanceSaveModal && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center pb-3 border-b border-black/10">
                <div>
                  <h3 className="text-lg font-black text-[#000000] tracking-tight">Save as Advance Order</h3>
                  <p className="text-[10px] font-bold text-[#B45309] mt-0.5 uppercase tracking-wider">Not counted as revenue until fully paid</p>
                </div>
                <button onClick={() => setShowAdvanceSaveModal(false)} className="text-black hover:bg-black/5 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="bg-[#FEF3C7] border border-[#F59E0B]/40 rounded-lg p-3">
                  <div className="flex justify-between text-[10px] font-bold text-[#78350F] uppercase tracking-wider">
                    <span>Order Total</span>
                    <span>₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Deposit Amount (₹) *</label>
                  <input
                    type="number"
                    value={advDeposit}
                    onChange={(e) => setAdvDeposit(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full bg-white border border-black/15 focus:border-[#F59E0B] rounded-lg px-3 py-2.5 text-sm font-bold text-black focus:outline-none"
                    placeholder="0.00"
                    autoFocus
                  />
                  {typeof advDeposit === "number" && advDeposit > 0 && (
                    <p className="mt-1.5 text-[10px] font-bold text-[var(--accent-strong)]">
                      Balance due: ₹{Math.max(0, grandTotal - Number(advDeposit)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Deposit Payment Mode</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ORDER_PAYMENT_MODES.map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAdvDepositPaymentMode(mode)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                          advDepositPaymentMode === mode ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-black border-black/10 hover:border-[var(--accent)]"
                        }`}
                      >
                        {mode === "GPAY" ? "GPay" : mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={advDeliveryDate}
                    onChange={(e) => setAdvDeliveryDate(e.target.value)}
                    className="w-full bg-white border border-black/15 focus:border-[#F59E0B] rounded-lg px-3 py-2 text-sm font-bold text-black focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                  <textarea
                    value={advNotes}
                    onChange={(e) => setAdvNotes(e.target.value)}
                    className="w-full bg-white border border-black/15 focus:border-[#F59E0B] rounded-lg px-3 py-2 text-sm text-black focus:outline-none min-h-[60px] resize-none"
                    placeholder="e.g. Colour preference, follow-up needed..."
                  />
                </div>

                <button
                  onClick={saveAdvanceOrder}
                  disabled={isSavingAdvance}
                  className={`w-full py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 bg-[#F59E0B] hover:bg-[#D97706] text-white shadow-md transition-all ${
                    isSavingAdvance ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  {isSavingAdvance ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></>) : (<><Clock className="w-4 h-4" /><span>Confirm Advance Order</span></>)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Advance Order VIEW / RECEIVE-BALANCE dialog ────────── */}
        {selectedAdvance && advanceViewMode && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center pb-3 border-b border-black/10">
                <div>
                  <p className="text-[11px] font-mono font-bold text-[var(--accent)]">{selectedAdvance.id}</p>
                  <h3 className="text-lg font-black text-[#000000] tracking-tight">
                    {advanceViewMode === "receive" ? "Receive Remaining Payment" : "Advance Order Details"}
                  </h3>
                </div>
                <button onClick={closeAdvanceDialog} className="text-black hover:bg-black/5 w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Customer + Items summary (both modes) */}
              <div className="mt-4 space-y-3">
                <div className="bg-[#F9FAFB] border border-black/10 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-strong)]">Customer</p>
                  <p className="text-sm font-black text-black">{selectedAdvance.customer_name}</p>
                  <p className="text-[11px] font-bold text-[var(--accent-strong)]">{selectedAdvance.customer_phone}</p>
                  {selectedAdvance.customer_address && (
                    <p className="text-[11px] text-[var(--accent-strong)] mt-0.5">{selectedAdvance.customer_address}</p>
                  )}
                </div>

                <div className="border border-black/10 rounded-lg divide-y divide-black/5">
                  {selectedAdvance.items.map((it) => (
                    <div key={it.id} className="flex justify-between items-center p-2.5 text-xs">
                      <div>
                        <p className="font-bold text-black">{it.snapshot_name}</p>
                        <p className="text-[10px] text-[var(--accent-strong)]">Qty: {it.quantity} × ₹{Number(it.snapshot_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <p className="font-black text-black">₹{(Number(it.snapshot_price) * it.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#F4F4F5] border border-black/10 rounded-lg p-2.5">
                    <p className="text-[9px] font-bold text-[var(--accent-strong)] uppercase tracking-wider">Total</p>
                    <p className="text-sm font-black text-black">₹{Number(selectedAdvance.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-[#DCFCE7] border border-[#16A34A]/30 rounded-lg p-2.5">
                    <p className="text-[9px] font-bold text-[#166534] uppercase tracking-wider">Paid</p>
                    <p className="text-sm font-black text-[#166534]">₹{Number(selectedAdvance.deposit_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-[#FEE2E2] border border-[#DC2626]/30 rounded-lg p-2.5">
                    <p className="text-[9px] font-bold text-[#991B1B] uppercase tracking-wider">Balance</p>
                    <p className="text-sm font-black text-[#991B1B]">₹{balanceRemaining(selectedAdvance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>

                {selectedAdvance.delivery_date && (
                  <p className="text-[11px] font-bold text-[var(--accent-strong)]"><Calendar className="w-3 h-3 inline mr-1" />Delivery: {new Date(selectedAdvance.delivery_date).toLocaleDateString()}</p>
                )}
                {selectedAdvance.notes && (
                  <div className="bg-[#FEF9C3] border border-[#EAB308]/30 rounded-lg p-2.5 text-[11px] text-[#78350F]">
                    <span className="font-bold">Notes: </span>{selectedAdvance.notes}
                  </div>
                )}

                {/* Print / Share the advance receipt (view mode) */}
                {advanceViewMode === "view" && (
                  <div className="pt-3 border-t border-black/10 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => printAdvanceReceipt(selectedAdvance.id)}
                      className="bg-white border border-gray-300 hover:bg-gray-50 text-black py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Print Receipt
                    </button>
                    <button
                      onClick={() =>
                        shareAdvanceReceiptWhatsApp({
                          id: selectedAdvance.id,
                          customerName: selectedAdvance.customer_name || "Guest",
                          customerPhone: selectedAdvance.customer_phone,
                          total: Number(selectedAdvance.total_amount) || 0,
                          deposit: Number(selectedAdvance.deposit_amount) || 0,
                          balance: balanceRemaining(selectedAdvance),
                        })
                      }
                      className="bg-[#10B981] hover:bg-[#059669] text-white py-2.5 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                      Share Receipt
                    </button>
                  </div>
                )}

                {/* Receive-payment specific fields */}
                {advanceViewMode === "receive" && selectedAdvance.status !== "COMPLETED" && selectedAdvance.status !== "CANCELLED" && (
                  <div className="pt-3 border-t border-black/10 space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Manual Discount</label>
                      <div className="flex gap-2">
                        <select
                          value={receiveDiscountType}
                          onChange={(e) => setReceiveDiscountType(e.target.value as "FIXED" | "PERCENT")}
                          className="bg-white border border-black/15 rounded-lg px-2 py-2 text-xs font-bold focus:outline-none"
                        >
                          <option value="FIXED">₹</option>
                          <option value="PERCENT">%</option>
                        </select>
                        <input
                          type="number"
                          value={receiveDiscountValue}
                          onChange={(e) => setReceiveDiscountValue(e.target.value === "" ? "" : parseFloat(e.target.value))}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="flex-1 bg-white border border-black/15 focus:border-[var(--accent)] rounded-lg px-3 py-2 text-sm font-bold focus:outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1.5">Payment Method</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ORDER_PAYMENT_MODES.map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setReceivePaymentMode(mode)}
                            className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                              receivePaymentMode === mode ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-black border-black/10 hover:border-[var(--accent)]"
                            }`}
                          >
                            {mode === "GPAY" ? "GPay" : mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#DCFCE7] border border-[#16A34A]/40 rounded-lg p-3 text-center">
                      <p className="text-[10px] font-bold text-[#166534] uppercase tracking-wider">Final Amount to Collect</p>
                      <p className="text-2xl font-black text-[#166534]">₹{receiveBalanceFinalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>

                    <p className="text-[10px] font-bold text-[#78350F] bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-lg p-2.5">
                      Confirmation marks the order Completed, creates one official invoice, and recognizes the full ₹{Number(selectedAdvance.total_amount - receiveBalanceDiscountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} as revenue.
                    </p>

                    <button
                      onClick={confirmReceiveBalance}
                      disabled={isFinalizing}
                      className={`w-full py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white shadow-md transition-all ${
                        isFinalizing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      {isFinalizing ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>Finalizing...</span></>) : (<><Check className="w-4 h-4" /><span>Confirm Final Payment</span></>)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Advance Orders tab ─────────────────────────────────── */}
        {activeTab === "advance" && (
          <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight">Advance Orders</h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">Partial-payment holds — revenue is recognized only when the balance is collected.</p>
              </div>

              {advanceOrders.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="flex flex-wrap items-center bg-[#FFFFFF] border border-black/10 rounded-xl p-1 gap-1 max-w-full">
                    <span className="text-[9px] font-bold text-[#000000] uppercase tracking-wider px-2">
                      Period:
                    </span>
                    {(["all", "today", "week", "month", "year"] as const).map(
                      (p) => {
                        const displayLabel =
                          p === "all"
                            ? "All Time"
                            : p === "today"
                              ? "Today"
                              : p === "week"
                                ? "This Week"
                                : p === "month"
                                  ? "This Month"
                                  : "This Year";
                        const isActive = advPeriod === p;
                        return (
                          <button
                            key={p}
                            onClick={() => {
                              setAdvPeriod(p);
                              setAdvStartDate("");
                              setAdvEndDate("");
                            }}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              isActive
                                ? "bg-[var(--accent)] text-[#FFFFFF] shadow-sm"
                                : "text-[#000000] hover:bg-[#000000]/50"
                            }`}
                          >
                            {displayLabel}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="flex flex-wrap items-center border rounded-xl px-3 py-1.5 gap-2 shadow-sm bg-white border-black/10 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        From:
                      </span>
                      <input
                        type="date"
                        value={advStartDate}
                        onChange={(e) => {
                          setAdvPeriod("custom");
                          setAdvStartDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        To:
                      </span>
                      <input
                        type="date"
                        value={advEndDate}
                        onChange={(e) => {
                          setAdvPeriod("custom");
                          setAdvEndDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {(() => {
                const pending = advanceOrders.filter((a) => a.status === "PENDING" || a.status === "READY");
                const outstanding = pending.reduce((acc, a) => acc + balanceRemaining(a), 0);
                const ready = advanceOrders.filter((a) => a.status === "READY").length;
                const completed = advanceOrders.filter((a) => a.status === "COMPLETED").length;
                return (
                  <>
                    <div className="bg-white border border-black/10 rounded-xl p-4 shadow-xs flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--accent-strong)] uppercase tracking-wider">Outstanding Balance</p>
                        <p className="text-xl font-black text-black">₹{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-[#FEE2E2] flex items-center justify-center">
                        <IndianRupee className="w-5 h-5 text-[#DC2626]" />
                      </div>
                    </div>
                    <div className="bg-white border border-black/10 rounded-xl p-4 shadow-xs flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--accent-strong)] uppercase tracking-wider">Ready For Collection</p>
                        <p className="text-xl font-black text-black">{ready}</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-[#DBEAFE] flex items-center justify-center">
                        <Package className="w-5 h-5 text-[#2563EB]" />
                      </div>
                    </div>
                    <div className="bg-white border border-black/10 rounded-xl p-4 shadow-xs flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--accent-strong)] uppercase tracking-wider">Completed Deposits</p>
                        <p className="text-xl font-black text-black">{completed}</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] flex items-center justify-center">
                        <Check className="w-5 h-5 text-[#16A34A]" />
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Search + status filter */}
            <div className="bg-white border border-black/10 rounded-xl p-3 mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-[var(--accent-strong)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={advSearchQuery}
                  onChange={(e) => setAdvSearchQuery(e.target.value)}
                  placeholder="Search by ID, customer, phone, product or status"
                  className="w-full bg-white border border-black/10 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["ALL", "PENDING", "READY", "COMPLETED", "CANCELLED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setAdvStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      advStatusFilter === s ? "bg-[var(--accent)] text-white" : "bg-[#F4F4F5] text-black hover:bg-black/10"
                    }`}
                  >
                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Rows */}
            <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.1fr_1.3fr_1.5fr_1.5fr_0.9fr_1.1fr_1.4fr] gap-3 px-4 py-3 border-b border-black/10 text-[10px] font-black uppercase tracking-wider text-[var(--accent-strong)] bg-[#F9FAFB]">
                <span>Deposit ID</span>
                <span>Customer</span>
                <span>Product</span>
                <span>Total / Paid / Balance</span>
                <span>Delivery</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              {(() => {
                const q = advSearchQuery.trim().toLowerCase();
                const filtered = advanceOrders.filter((a) => {
                  if (!isDateInPeriod(a.created_at, advPeriod, advStartDate, advEndDate)) return false;
                  if (advStatusFilter !== "ALL" && a.status !== advStatusFilter) return false;
                  if (!q) return true;
                  return (
                    a.id.toLowerCase().includes(q) ||
                    a.customer_name.toLowerCase().includes(q) ||
                    a.customer_phone.includes(q) ||
                    a.status.toLowerCase().includes(q) ||
                    a.items.some((i) => i.snapshot_name.toLowerCase().includes(q))
                  );
                });
                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center text-xs font-bold text-[var(--accent-strong)]">
                      No advance orders match the current filters.
                    </div>
                  );
                }
                return filtered.map((a) => {
                  const bal = balanceRemaining(a);
                  const statusStyles: Record<AdvanceOrderStatus, string> = {
                    PENDING: "bg-[#FEF3C7] text-[#78350F] border-[#F59E0B]/30",
                    READY: "bg-[#DBEAFE] text-[#1E3A8A] border-[#2563EB]/30",
                    COMPLETED: "bg-[#DCFCE7] text-[#166534] border-[#16A34A]/30",
                    CANCELLED: "bg-[#FEE2E2] text-[#991B1B] border-[#DC2626]/30",
                  };
                  return (
                    <div key={a.id} className="grid grid-cols-1 md:grid-cols-[1.1fr_1.3fr_1.5fr_1.5fr_0.9fr_1.1fr_1.4fr] gap-3 px-4 py-3 border-b border-black/5 items-center text-xs hover:bg-[#FAFAFA]">
                      <div>
                        <p className="font-mono font-black text-[11px] text-black">{a.id}</p>
                        <p className="text-[9px] font-bold text-[var(--accent-strong)]">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="font-black text-black">{a.customer_name}</p>
                        <p className="text-[10px] text-[var(--accent-strong)]">{a.customer_phone}</p>
                      </div>
                      <div className="text-[11px]">
                        {a.items.slice(0, 2).map((i) => (
                          <p key={i.id} className="font-bold text-black truncate">
                            {i.quantity}× {i.snapshot_name}
                          </p>
                        ))}
                        {a.items.length > 2 && (
                          <p className="text-[10px] text-[var(--accent-strong)]">+{a.items.length - 2} more</p>
                        )}
                      </div>
                      <div className="text-[11px]">
                        <p className="font-bold text-black">Total: ₹{Number(a.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className="text-[#16A34A] font-bold">Paid: ₹{Number(a.deposit_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className="text-[#DC2626] font-bold">Balance: ₹{bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-[11px] font-bold text-[var(--accent-strong)]">
                        {a.delivery_date ? new Date(a.delivery_date).toLocaleDateString() : "—"}
                      </div>
                      <div>
                        <span className={`inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${statusStyles[a.status]}`}>
                          {a.status}
                        </span>
                        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
                          <button
                            onClick={() => toggleAdvanceReady(a)}
                            className="block mt-1 text-[9px] font-black uppercase tracking-wider text-[#2563EB] hover:underline cursor-pointer"
                          >
                            Mark as {a.status === "READY" ? "Pending" : "Ready"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                        <button onClick={() => shareAdvanceReceiptWhatsApp({
                          id: a.id,
                          customerName: a.customer_name,
                          customerPhone: a.customer_phone,
                          total: Number(a.total_amount),
                          deposit: Number(a.deposit_amount),
                          balance: bal
                        })} title="Send on WhatsApp" className="flex items-center justify-center w-8 h-8 bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#10B981] rounded-md transition-colors cursor-pointer shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                          </svg>
                        </button>
                        <button onClick={() => {
                          if (a.status === "COMPLETED" && a.finalized_order_id) {
                            setActiveInvoiceId(a.finalized_order_id);
                          } else {
                            printAdvanceReceipt(a.id);
                          }
                        }} title={a.status === "COMPLETED" ? "Open Final Invoice" : "Print Advance Receipt"} className="flex items-center justify-center w-8 h-8 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] rounded-md transition-colors cursor-pointer shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        <button onClick={() => openAdvanceView(a)} title="View details" className="flex items-center justify-center w-8 h-8 bg-black/5 hover:bg-black/10 text-[#000000] rounded-md transition-colors cursor-pointer shrink-0">
                          <Eye className="w-4 h-4" />
                        </button>
                        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
                          <button onClick={() => openReceiveBalance(a)} title="Receive balance" className="flex items-center justify-center w-8 h-8 bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#10B981] rounded-md transition-colors cursor-pointer shrink-0">
                            <IndianRupee className="w-4 h-4" />
                          </button>
                        )}
                        {a.status !== "COMPLETED" && a.status !== "CANCELLED" && (
                          <button onClick={() => doCancelAdvance(a)} title="Cancel" className="flex items-center justify-center w-8 h-8 bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#D97706] rounded-md transition-colors cursor-pointer shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {role === "admin" && (
                          <button onClick={() => doDeleteAdvance(a)} title="Delete" className="flex items-center justify-center w-8 h-8 bg-[#DC2626]/10 hover:bg-[#DC2626]/20 text-[#DC2626] rounded-md transition-colors cursor-pointer shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
            {/* Header Panel */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight">
                  Order History
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  Manage and track past invoices
                </p>
              </div>

              {orders.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="flex flex-wrap items-center bg-[#FFFFFF] border border-black/10 rounded-xl p-1 gap-1 max-w-full">
                    <span className="text-[9px] font-bold text-[#000000] uppercase tracking-wider px-2">
                      Period:
                    </span>
                    {(["all", "today", "week", "month", "year"] as const).map(
                      (p) => {
                        const displayLabel =
                          p === "all"
                            ? "All Time"
                            : p === "today"
                              ? "Today"
                              : p === "week"
                                ? "This Week"
                                : p === "month"
                                  ? "This Month"
                                  : "This Year";
                        const isActive = historyPeriod === p;
                        return (
                          <button
                            key={p}
                            onClick={() => {
                              setHistoryPeriod(p);
                              setHistoryStartDate("");
                              setHistoryEndDate("");
                            }}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              isActive
                                ? "bg-[var(--accent)] text-[#FFFFFF] shadow-sm"
                                : "text-[#000000] hover:bg-[#000000]/50"
                            }`}
                          >
                            {displayLabel}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="flex flex-wrap items-center border rounded-xl px-3 py-1.5 gap-2 shadow-sm bg-white border-black/10 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        From:
                      </span>
                      <input
                        type="date"
                        value={historyStartDate}
                        onChange={(e) => {
                          setHistoryPeriod("custom");
                          setHistoryStartDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        To:
                      </span>
                      <input
                        type="date"
                        value={historyEndDate}
                        onChange={(e) => {
                          setHistoryPeriod("custom");
                          setHistoryEndDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-4 py-2 border-2 border-[var(--accent)] bg-transparent text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#FFFFFF] rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              )}
            </div>

            {orders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-xl bg-[#FFFFFF] py-12">
                <p className="text-[#000000] font-medium">
                  No past transactions yet.
                </p>
              </div>
            ) : (
              <>
                {/* Search and Filters Bar */}
                <div className="bg-white border-2 border-black/10 rounded-xl p-4 mb-6 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 w-full">
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Search Order ID
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#000000] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="e.g. INV-..."
                          className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[var(--accent)] rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                          value={orderSearchId}
                          onChange={(e) => setOrderSearchId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        placeholder="Search name..."
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                        value={orderSearchName}
                        onChange={(e) => setOrderSearchName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Customer Phone
                      </label>
                      <input
                        type="text"
                        placeholder="Search phone..."
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                        value={orderSearchPhone}
                        onChange={(e) => setOrderSearchPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Order Source
                      </label>
                      <select
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[var(--accent)] rounded-lg px-3 py-1.5 text-xs font-bold text-[#000000] focus:outline-none cursor-pointer"
                        value={orderFilterSource}
                        onChange={(e) => setOrderFilterSource(e.target.value)}
                      >
                        <option value="ALL">All Sources</option>
                        <option value="ONLINE">Online Orders</option>
                        <option value="OFFLINE">Offline (POS)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {(() => {
                  const filteredOrders = historyFilteredOrders;

                  if (filteredOrders.length === 0) {
                    return (
                      <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-xl bg-[#FFFFFF] py-12">
                        <p className="text-[#000000] font-semibold">
                          No transactions match your search filters.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-[#FFFFFF] border-2 border-black/10 rounded-xl shadow-sm overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#FFFFFF] border-b border-black/10 select-none">
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Order ID
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Date &amp; Time
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Customer Name
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Mobile Number
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Source
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Total Due
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest text-right">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.map((order) => (
                            <tr
                              key={order.id}
                              className="border-b border-transparent hover:bg-[#FFFFFF] transition-colors"
                            >
                              <td className="p-4 text-xs font-semibold text-[#000000]">
                                {order.id}
                              </td>
                              <td className="p-4 text-xs font-bold text-[#000000] whitespace-nowrap">
                                {new Date(order.date).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                                <span className="block text-[10px] font-semibold text-black/60">
                                  {new Date(
                                    order.createdAt || order.date,
                                  ).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "Asia/Kolkata",
                                  })}
                                </span>
                              </td>
                              <td className="p-4 text-xs font-bold text-[#000000]">
                                {order.customerName}
                              </td>
                              <td className="p-4 text-xs font-mono font-bold text-[#000000]">
                                {order.customerPhone || "-"}
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${order.source === "ONLINE" ? "border-[#00A86B] text-[#00A86B] bg-[#00A86B]/10" : "border-[#27272A] text-[#27272A] bg-[#27272A]/10"}`}
                                  >
                                    {order.source}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${order.isGst ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-black/20 text-[#111827] bg-black/5"}`}
                                  >
                                    {order.isGst ? "GST" : "NON-GST"}
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 text-sm font-black text-[var(--accent)]">
                                ₹{order.grandTotal.toLocaleString()}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex flex-row items-center justify-end gap-1.5">
                                  <span className="px-3 py-1 rounded bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold uppercase tracking-wider hidden lg:inline-block mr-1">
                                    {order.status}
                                  </span>
                                  <button
                                    onClick={() => resendWhatsApp(order)}
                                    title="Send on WhatsApp"
                                    aria-label="Send on WhatsApp"
                                    className="flex items-center justify-center w-8 h-8 bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#10B981] rounded-md transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setActiveInvoiceId(order.id)}
                                    title="View invoice"
                                    aria-label="View invoice"
                                    className="flex items-center justify-center w-8 h-8 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-[var(--accent)] rounded-md transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setSelectedOrder(order)}
                                    title="Order details"
                                    aria-label="Order details"
                                    className="flex items-center justify-center w-8 h-8 bg-black/5 hover:bg-black/10 text-[#000000] rounded-md transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                      />
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                      />
                                    </svg>
                                  </button>
                                  {role === "admin" && (
                                    <button
                                      onClick={() =>
                                        handleDeleteOrder(order.id)
                                      }
                                      title="Delete order"
                                      aria-label="Delete order"
                                      className="flex items-center justify-center w-8 h-8 bg-[#DC2626]/10 hover:bg-[#DC2626]/20 text-[#DC2626] rounded-md transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {role === "admin" && activeTab === "analytics" && (
          <div className="flex-1 flex flex-col max-w-[1400px] min-w-0 mx-auto w-full pb-8 pr-2">
            {/* Header Panel */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight">
                  {analyticsGstFilter === "gst"
                    ? "GST Revenue"
                    : analyticsGstFilter === "nongst"
                      ? "Non-GST Revenue"
                      : "Revenue Analytics"}
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  {analyticsGstFilter === "gst"
                    ? "GST invoices only — taxable sales dashboard"
                    : analyticsGstFilter === "nongst"
                      ? "Non-GST bills only — retail sales dashboard"
                      : "All bills — full store & channel insights"}
                </p>
              </div>

              {/* Period Filters & Refresh Button */}
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                {analyticsSubTab !== "today" && (
                  <>
                    <div className="flex flex-wrap items-center bg-[#FFFFFF] border border-black/10 rounded-xl p-1 gap-1 max-w-full">
                      <span className="text-[9px] font-bold text-[#000000] uppercase tracking-wider px-2">
                        Period:
                      </span>
                      {(["all", "today", "week", "month", "year"] as const).map(
                        (p) => {
                          const displayLabel =
                            p === "all"
                              ? "All Time"
                              : p === "today"
                                ? "Today"
                                : p === "week"
                                  ? "This Week"
                                  : p === "month"
                                    ? "This Month"
                                    : "This Year";
                          const isActive = analyticsPeriod === p;
                          return (
                            <button
                              key={p}
                              onClick={() => {
                                setAnalyticsPeriod(p);
                                setAnalyticsStartDate("");
                                setAnalyticsEndDate("");
                              }}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                isActive
                                  ? "bg-[var(--accent)] text-[#FFFFFF] shadow-sm"
                                  : "text-[#000000] hover:bg-[#000000]/50"
                              }`}
                            >
                              {displayLabel}
                            </button>
                          );
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap items-center border rounded-xl px-3 py-1.5 gap-2 shadow-sm bg-white border-black/10 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                          From:
                        </span>
                        <input
                          type="date"
                          value={analyticsStartDate}
                          onChange={(e) => {
                            setAnalyticsPeriod("custom");
                            setAnalyticsStartDate(e.target.value);
                          }}
                          className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                          To:
                        </span>
                        <input
                          type="date"
                          value={analyticsEndDate}
                          onChange={(e) => {
                            setAnalyticsPeriod("custom");
                            setAnalyticsEndDate(e.target.value);
                          }}
                          className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* GST / Non-GST Dashboard Switch */}
            <div className="flex items-center gap-1 bg-[#FFFFFF] border border-black/10 rounded-xl p-1 mb-6 w-full sm:w-auto sm:self-start">
              {(
                [
                  ["all", "All Bills"],
                  ["gst", "GST Invoices"],
                  ["nongst", "Non-GST Bills"],
                ] as const
              ).map(([key, label]) => {
                const isActive = analyticsGstFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setAnalyticsGstFilter(key)}
                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      isActive
                        ? key === "gst"
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : key === "nongst"
                            ? "bg-[#111827] text-white shadow-sm"
                            : "bg-[var(--accent)] text-white shadow-sm"
                        : "text-[#000000] hover:bg-black/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Sub Navigation Tabs */}
            <div className="flex border-b border-black/10 mb-6 gap-6 overflow-x-auto scrollbar-none pb-0.5 w-full shrink-0">
              {(["revenue", "today", "products", "coupons"] as const).map(
                (tab) => {
                  const isActive = analyticsSubTab === tab;
                  const displayLabel =
                    tab === "today"
                      ? "Today's Sales"
                      : tab === "revenue"
                        ? "Revenue"
                        : tab === "products"
                          ? "Products"
                          : "Coupons";
                  return (
                    <button
                      key={tab}
                      onClick={() => setAnalyticsSubTab(tab)}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer shrink-0 ${
                        isActive
                          ? "text-[var(--accent)]"
                          : "text-[#000000] hover:text-[#000000]"
                      }`}
                    >
                      {displayLabel}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full" />
                      )}
                    </button>
                  );
                },
              )}
            </div>

            {/* Tab Contents */}
            {analyticsSubTab === "today" && (
              <>
                {/* Today's KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Revenue
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                        <IndianRupee className="w-3 h-3 text-[#10B981] animate-pulse" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹{todayRevenue.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Completed today
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-tertiary/10 flex items-center justify-center">
                        <Trophy className="w-3 h-3 text-tertiary animate-swing" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {todayOrdersCount}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Completed today
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Items Sold
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                        <Package className="w-3 h-3 text-[var(--accent)] animate-pop" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {todayItemsSold} pcs
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Quantity sold today
                    </div>
                  </div>
                </div>

                {/* Today's Detailed Split */}
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 mb-8">
                  {/* Left Side: Today's Order Source & Leaderboard */}
                  <div className="col-span-8 w-full flex flex-col gap-6">
                    {/* Today's Transactions Table */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm flex-1">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="font-bold text-[#000000] text-sm">
                          Today's Transactions
                        </h3>

                        {/* Contact Search Input */}
                        <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                          <Search className="w-3.5 h-3.5 text-[#000000]" />
                          <input
                            type="text"
                            placeholder="Search contact/invoice..."
                            className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[170px]"
                            value={analyticsSearchPhone}
                            onChange={(e) =>
                              setAnalyticsSearchPhone(e.target.value)
                            }
                          />
                        </div>
                      </div>
                      {todayOrders.length === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-12">
                          {analyticsSearchPhone
                            ? "No matching transactions found."
                            : "No orders placed today."}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#FFFFFF] border-b border-black/10">
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Invoice ID
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Customer No
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Source
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                                  Items
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                                  Grand Total
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {todayOrders.map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-semibold text-[#000000]">
                                    {order.id}
                                  </td>
                                  <td className="p-3 text-xs font-mono font-bold text-[#000000]">
                                    {order.customerPhone || "-"}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${order.source === "ONLINE" ? "border-[#00A86B] text-[#00A86B] bg-[#00A86B]/10" : "border-[#27272A] text-[#27272A] bg-[#27272A]/10"}`}
                                    >
                                      {order.source}
                                    </span>
                                  </td>
                                  <td className="p-3 text-xs font-semibold text-[#000000] text-right">
                                    {order.items.reduce(
                                      (sum, i) =>
                                        sum +
                                        (i.name && !i.name.startsWith("GST (")
                                          ? i.qty
                                          : 0),
                                      0,
                                    )}{" "}
                                    pcs
                                  </td>
                                  <td className="p-3 text-xs font-black text-[var(--accent)] text-right">
                                    ₹{order.grandTotal.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Channel Split & Top items */}
                  <div className="col-span-4 w-full flex flex-col gap-6">
                    {/* Today's Channel Split Card */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                      <h3 className="font-bold text-[#000000] mb-4 text-sm">
                        Today's Channel Split
                      </h3>
                      {todayOrdersCount === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-6">
                          No sales today.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#27272A] uppercase tracking-wider w-14">
                              Offline
                            </span>
                            <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#27272A] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(todayOfflineOrdersCount / todayOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-12 text-right">
                              ₹{todayOfflineRevenue.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#00A86B] uppercase tracking-wider w-14">
                              Online
                            </span>
                            <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#00A86B] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(todayOnlineOrdersCount / todayOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-12 text-right">
                              ₹{todayOnlineRevenue.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Today's Top Products Sold Card */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm flex-1">
                      <h3 className="font-bold text-[#000000] text-sm mb-4">
                        Today's Top Items
                      </h3>
                      {todayTopItems.length === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-6">
                          No items sold today.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {todayTopItems.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-3"
                            >
                              <span className="text-[11px] font-black text-[#000000] w-4">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </span>
                                  <span className="text-xs font-black text-[var(--accent)]">
                                    ₹{item.revenue.toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-700"
                                    style={{
                                      width: `${(item.revenue / todayTopItems[0].revenue) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-[#000000] font-semibold w-10 text-right">
                                {item.qty} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {analyticsSubTab === "revenue" && (
              <>
                {/* Profit Summary — ONLY visible when viewing All Bills */}
                {analyticsGstFilter === "all" && (
                  <div className="space-y-3 mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Card 1: Net Earnings (GST + Non-GST - Expenses) */}
                      {(() => {
                        const netProfit =
                          gstRevenue + nonGstRevenue - analyticsExpensesTotal;
                        const positive = netProfit >= 0;
                        const accent = positive ? "#059669" : "#B91C1C";
                        return (
                          <div
                            className="rounded-2xl p-5 shadow-sm text-white hover:shadow-md transition-all"
                            style={{
                              background: `linear-gradient(135deg, ${accent}, #18181B)`,
                            }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                                Net Earnings
                              </span>
                              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                                <PiggyBank className="w-4 h-4 text-white" />
                              </div>
                            </div>
                            <div className="text-2xl font-black text-white">
                              {positive ? "" : "− "}₹
                              {Math.abs(netProfit).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            <div className="text-[9px] text-white/95 font-black mt-1 tracking-wide">
                              GST + Non-GST − Expenses
                            </div>
                          </div>
                        );
                      })()}

                      {/* Card 2: GST Revenue */}
                      <div className="bg-white border border-[var(--accent)]/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                            GST Sales
                          </span>
                          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                            <IndianRupee className="w-4 h-4 text-[var(--accent)]" />
                          </div>
                        </div>
                        <div className="text-2xl font-black text-[var(--accent)]">
                          ₹
                          {gstRevenue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-[9px] text-[#000000] font-semibold mt-1">
                          {gstOrdersCount} GST invoices
                        </div>
                      </div>

                      {/* Card 3: Non-GST Revenue */}
                      <div className="bg-white border border-[#059669]/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                            Non-GST Sales
                          </span>
                          <div className="w-8 h-8 rounded-full bg-[#059669]/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-[#059669]" />
                          </div>
                        </div>
                        <div className="text-2xl font-black text-[#059669]">
                          + ₹
                          {nonGstRevenue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-[9px] text-[#000000] font-semibold mt-1">
                          {nonGstOrdersCount} retail bills
                        </div>
                      </div>

                      {/* Card 4: Total Expenses */}
                      <div className="bg-white border border-[#B91C1C]/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                            Total Expenses
                          </span>
                          <div className="w-8 h-8 rounded-full bg-[#B91C1C]/10 flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-[#B91C1C]" />
                          </div>
                        </div>
                        <div className="text-2xl font-black text-[#B91C1C]">
                          − ₹
                          {analyticsExpensesTotal.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <button
                          onClick={() => setActiveTab("expenses")}
                          className="text-[9px] text-[#B91C1C] font-bold mt-1 underline underline-offset-2 cursor-pointer hover:opacity-80 block"
                        >
                          Money out — Expense Tracker
                        </button>
                      </div>
                    </div>

                    {/* Formula Calculation Banner */}
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Calculation Formula
                        </span>
                        <span className="text-slate-600 font-semibold">
                          GST (₹
                          {gstRevenue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                          ) + Non-GST (₹
                          {nonGstRevenue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                          ) − Expenses (₹
                          {analyticsExpensesTotal.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                          )
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-slate-500">= Net Profit:</span>
                        <span
                          className={`font-black font-mono text-sm ${
                            gstRevenue +
                              nonGstRevenue -
                              analyticsExpensesTotal >=
                            0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          ₹
                          {(
                            gstRevenue +
                            nonGstRevenue -
                            analyticsExpensesTotal
                          ).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Top 5x2 KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  {/* Row 1 */}
                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Revenue
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                        <IndianRupee className="w-3 h-3 text-[#10B981] animate-pulse" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹
                      {totalRevenueAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      {analyticsGstFilter === "all"
                        ? `GST (₹${gstRevenue.toLocaleString("en-IN")}) + Non-GST (₹${nonGstRevenue.toLocaleString("en-IN")})`
                        : "POS + manual combined"}
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Completed Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                        <Trophy className="w-3 h-3 text-[#10B981] animate-swing" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {totalOrdersCount}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      POS + manual bills
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Offline Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#06B6D4]/10 flex items-center justify-center">
                        <IndianRupee className="w-3 h-3 text-[#06B6D4] animate-bounce" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹
                      {offlineRevenue.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Walk-in POS sales
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Online Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[var(--accent-strong)]/10 flex items-center justify-center">
                        <IndianRupee className="w-3 h-3 text-[var(--accent-strong)] animate-float" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹
                      {onlineRevenue.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Online POS sales
                    </div>
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 ${
                    analyticsGstFilter === "all"
                      ? "lg:grid-cols-4"
                      : "lg:grid-cols-3"
                  } gap-4 mb-8`}
                >
                  {/* Row 2 */}
                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Offline Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#27272A]/10 flex items-center justify-center">
                        <ShoppingBag className="w-3 h-3 text-[#27272A] animate-pulse" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {offlineOrders}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Walk-in POS orders
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Online Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[var(--accent-strong)]/10 flex items-center justify-center">
                        <Globe className="w-3 h-3 text-[var(--accent-strong)] animate-float" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {onlineOrders}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Online channel orders
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Items Sold
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                        <Package className="w-3 h-3 text-[var(--accent)] animate-pop" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {totalItemsSold}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      From completed bills
                    </div>
                  </div>

                  {/* Top Product - only shown in All Bills; omitted in GST and Non-GST */}
                  {analyticsGstFilter === "all" && (
                    <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                          Top Product
                        </span>
                        <div className="w-6 h-6 rounded-full bg-[#EC4899]/10 flex items-center justify-center">
                          <Trophy className="w-3 h-3 text-[#EC4899] animate-pop" />
                        </div>
                      </div>
                      <div
                        className="text-xl font-black text-[#000000] mb-1 truncate"
                        title={topProduct}
                      >
                        {topProduct}
                      </div>
                      <div className="text-[9px] text-[#000000] font-semibold">
                        Most sold item
                      </div>
                    </div>
                  )}
                </div>

                {/* Main Charts & Breakdowns */}
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6">
                  {/* Left Chart Column */}
                  <div className="col-span-8 w-full flex flex-col gap-6">
                    {/* Monthly Revenue Trend Chart */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col min-h-[300px]">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h3 className="font-bold text-[#000000] text-sm mb-2 flex items-center">
                            Revenue Trend This Year{" "}
                            <span className="text-[var(--accent)] font-black ml-1.5">
                              {now.getFullYear()}
                            </span>
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-[#000000]">
                              ₹{totalYearRevenue.toLocaleString()}
                            </span>
                            {avgMonthRevenue > 0 && (
                              <span className="bg-[#FFFFFF] border border-black/10 text-[var(--accent)] px-2 py-0.5 rounded text-[10px] font-bold">
                                Avg ₹
                                {Math.round(avgMonthRevenue).toLocaleString()}
                                /mo
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {orders.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[#000000] text-sm font-semibold">
                          Process orders to see yearly revenue trend.
                        </div>
                      ) : (
                        <div className="flex-1 overflow-x-auto scrollbar-thin pb-2">
                          <div className="flex items-end justify-between px-2 gap-1 relative mt-4 min-w-[500px] h-[170px] pt-10">
                            {monthNames.map((month, i) => (
                              <div
                                key={month}
                                className="flex flex-col items-center gap-1.5 w-full group/bar relative outline-none"
                                tabIndex={0}
                              >
                                {/* Monthly sales text on top for mobile/visibility */}
                                <span className="text-[8px] font-black text-[var(--accent)] h-3 flex items-end">
                                  {monthRevenue[i] > 0
                                    ? monthRevenue[i] >= 1000
                                      ? `₹${(monthRevenue[i] / 1000).toFixed(1)}k`
                                      : `₹${monthRevenue[i]}`
                                    : ""}
                                </span>

                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#000000] text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 group-focus/bar:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                                  <div className="text-[9px] text-white/70 font-semibold mb-0.5">
                                    {monthNames[i]}
                                  </div>
                                  ₹{(monthRevenue[i] || 0).toLocaleString()}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#000000]"></div>
                                </div>
                                <div
                                  className="w-full max-w-[24px] bg-[var(--accent)] rounded-t-sm transition-all duration-1000 group-hover/bar:bg-[#6E9DB8] cursor-pointer min-h-[4px]"
                                  style={{
                                    height: `${Math.max(4, (monthRevenue[i] / maxMonthRevenue) * 100)}px`,
                                  }}
                                />
                                <span className="text-[10px] font-bold text-[#000000] uppercase">
                                  {month}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Weekly Revenue Bar Chart */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col min-h-[250px]">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h3 className="font-bold text-[#000000] text-sm flex items-center">
                            Revenue This Week{" "}
                            <span className="text-[var(--accent)] font-black ml-1.5">
                              (Week {currentWeekNumber} of {now.getFullYear()})
                            </span>
                          </h3>
                          <p className="text-[10px] text-[#000000] font-semibold mt-1">
                            ₹
                            {weekRevenue
                              .reduce((a, b) => a + b, 0)
                              .toLocaleString()}{" "}
                            total
                          </p>
                        </div>
                      </div>

                      {orders.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[#000000] text-sm font-semibold">
                          Process orders to see weekly revenue.
                        </div>
                      ) : (
                        <div className="flex-1 flex items-end justify-between px-2 gap-2">
                          {dayNames.map((day, i) => (
                            <div
                              key={day}
                              className="flex flex-col items-center gap-3 w-full group/bar relative outline-none"
                              tabIndex={0}
                            >
                              <span className="text-[9px] font-black text-[var(--accent)]">
                                {weekRevenue[i] > 0
                                  ? `₹${weekRevenue[i] >= 1000 ? (weekRevenue[i] / 1000).toFixed(1) + "k" : weekRevenue[i]}`
                                  : ""}
                              </span>

                              {/* Tooltip for exact weekly revenue */}
                              <div className="absolute bottom-[52px] mb-2 left-1/2 -translate-x-1/2 bg-[#000000] text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 group-focus/bar:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                                <div className="text-[9px] text-white/70 font-semibold mb-0.5">
                                  {dayNames[i]}
                                </div>
                                ₹{(weekRevenue[i] || 0).toLocaleString()}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#000000]"></div>
                              </div>

                              <div className="w-full max-w-[20px] h-32 bg-[#F3F4F6] rounded-full relative overflow-hidden cursor-pointer">
                                <div
                                  className="absolute bottom-0 w-full bg-[var(--accent)] rounded-full transition-all duration-1000 group-hover/bar:bg-[#6E9DB8]"
                                  style={{
                                    height: `${(weekRevenue[i] / maxWeekRevenue) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-[#000000] uppercase">
                                {day}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (Breakdowns) */}
                  <div className="col-span-4 w-full flex flex-col gap-6">
                    {/* Order Source Breakdown */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
                      <h3 className="font-bold text-[#000000] mb-4 text-sm">
                        Order Source
                      </h3>
                      {totalOrdersCount === 0 ? (
                        <div className="text-center text-[#000000] text-sm font-semibold py-6">
                          No orders yet.
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-[10px] font-bold text-[#27272A] uppercase tracking-wider w-14">
                              Offline
                            </span>
                            <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#27272A] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(offlineOrders / totalOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-8 text-right">
                              {offlineOrders}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#00A86B] uppercase tracking-wider w-14">
                              Online
                            </span>
                            <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#00A86B] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(onlineOrders / totalOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-8 text-right">
                              {onlineOrders}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Top Items by Revenue */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex-1">
                      <h3 className="font-bold text-[#000000] text-sm mb-4">
                        Top Items by Revenue
                      </h3>
                      {topItems.length === 0 ? (
                        <div className="text-center text-[#000000] text-sm font-semibold py-6">
                          No items sold yet.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {topItems.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-3"
                            >
                              <span className="text-[11px] font-black text-[#000000] w-4">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </span>
                                  <span className="text-xs font-black text-[var(--accent)]">
                                    ₹{item.revenue.toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-700"
                                    style={{
                                      width: `${(item.revenue / topItems[0].revenue) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-[#000000] font-semibold w-10 text-right">
                                {item.qty} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {analyticsSubTab === "products" && (
              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <h3 className="font-bold text-[#000000] text-sm">
                    Product Sales Leaderboard
                  </h3>

                  {/* Product Search Input */}
                  <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                    <Search className="w-3.5 h-3.5 text-[#000000]" />
                    <input
                      type="text"
                      placeholder="Search product..."
                      className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[180px]"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {Object.keys(itemSales).length === 0 ? (
                  <div className="text-center text-[#000000] text-sm font-semibold py-12">
                    No products sold in this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FFFFFF] border-b border-black/10">
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Product Name
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                            Qty Sold
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                            Revenue
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Market Share
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(itemSales).filter((item) =>
                          item.name
                            .toLowerCase()
                            .includes(productSearchQuery.toLowerCase()),
                        ).length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="text-center py-12 text-sm font-semibold text-[#000000]"
                            >
                              No matching products found.
                            </td>
                          </tr>
                        ) : (
                          Object.values(itemSales)
                            .filter((item) =>
                              item.name
                                .toLowerCase()
                                .includes(productSearchQuery.toLowerCase()),
                            )
                            .sort((a, b) => b.revenue - a.revenue)
                            .map((item, idx) => {
                              const share =
                                totalRevenueAmount > 0
                                  ? (item.revenue / totalRevenueAmount) * 100
                                  : 0;
                              return (
                                <tr
                                  key={item.name}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-black text-[#000000]">
                                    {idx + 1}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-[#000000] text-right">
                                    {item.qty} pcs
                                  </td>
                                  <td className="p-3 text-xs font-black text-[var(--accent)] text-right">
                                    ₹{item.revenue.toLocaleString()}
                                  </td>
                                  <td className="p-3 w-1/4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[var(--accent)] rounded-full"
                                          style={{ width: `${share}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-[#000000] w-8">
                                        {share.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {analyticsSubTab === "coupons" && (
              <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
                <div className="col-span-1 w-full bg-white border border-black/10 rounded-xl p-6 shadow-sm flex flex-col gap-6">
                  <h3 className="font-bold text-[#000000] text-sm">
                    Discount Summary
                  </h3>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Discounts Given
                      </span>
                      <Percent className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <span className="text-2xl font-black text-[var(--accent)]">
                      ₹
                      {analyticsFilteredOrders
                        .reduce((acc, o) => acc + o.discount, 0)
                        .toLocaleString()}
                    </span>
                  </div>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Discounted Orders
                      </span>
                      <Calendar className="w-4 h-4 text-tertiary" />
                    </div>
                    <span className="text-2xl font-black text-[#000000]">
                      {
                        analyticsFilteredOrders.filter((o) => o.discount > 0)
                          .length
                      }
                    </span>
                  </div>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Avg Discount Per Order
                      </span>
                      <IndianRupee className="w-4 h-4 text-[#10B981]" />
                    </div>
                    <span className="text-2xl font-black text-[#000000]">
                      ₹
                      {Math.round(
                        analyticsFilteredOrders.filter((o) => o.discount > 0)
                          .length > 0
                          ? analyticsFilteredOrders.reduce(
                              (acc, o) => acc + o.discount,
                              0,
                            ) /
                              analyticsFilteredOrders.filter(
                                (o) => o.discount > 0,
                              ).length
                          : 0,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="col-span-2 w-full bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="font-bold text-[#000000] text-sm">
                      Promo Campaign Performance
                    </h3>

                    {/* Coupons Search Input */}
                    <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                      <Search className="w-3.5 h-3.5 text-[#000000]" />
                      <input
                        type="text"
                        placeholder="Search code/mobile/amount..."
                        className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[220px]"
                        value={couponSearchQuery}
                        onChange={(e) => setCouponSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {analyticsFilteredOrders.filter((o) => o.discount > 0)
                    .length === 0 ? (
                    <div className="text-center text-[#000000] text-sm font-semibold py-12">
                      No promotional discounts given in this period.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#FFFFFF] border-b border-black/10">
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                              Transaction ID
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                              Customer Mobile
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                              Order Total
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                              Discount Applied
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsFilteredOrders
                            .filter((o) => o.discount > 0)
                            .filter((o) => {
                              const q = couponSearchQuery.toLowerCase();
                              const couponCode =
                                getCouponCodeForOrder(o).toLowerCase();
                              return (
                                o.id.toLowerCase().includes(q) ||
                                couponCode.includes(q) ||
                                (o.customerPhone || "").includes(q) ||
                                o.discount.toString().includes(q) ||
                                o.grandTotal.toString().includes(q)
                              );
                            }).length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="text-center py-12 text-sm font-semibold text-[#000000]"
                              >
                                No matching coupon performance records found.
                              </td>
                            </tr>
                          ) : (
                            analyticsFilteredOrders
                              .filter((o) => o.discount > 0)
                              .filter((o) => {
                                const q = couponSearchQuery.toLowerCase();
                                const couponCode =
                                  getCouponCodeForOrder(o).toLowerCase();
                                return (
                                  o.id.toLowerCase().includes(q) ||
                                  couponCode.includes(q) ||
                                  (o.customerPhone || "").includes(q) ||
                                  o.discount.toString().includes(q) ||
                                  o.grandTotal.toString().includes(q)
                                );
                              })
                              .map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-semibold text-[#000000]">
                                    {order.id}
                                  </td>
                                  <td className="p-3 text-xs font-mono font-bold text-[#000000]">
                                    {order.customerPhone || "-"}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-right text-[#000000]">
                                    ₹{order.grandTotal.toLocaleString()}
                                  </td>
                                  <td className="p-3 text-xs font-black text-[#27272A] text-right">
                                    -₹{order.discount.toLocaleString()}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {role === "admin" && activeTab === "expenses" && (
          <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight flex items-center gap-3">
                  <Wallet className="w-7 h-7 text-[var(--accent)]" />
                  Expense Tracker
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  Record what the shop spends. Expenses are offset against sales
                  to show your real Net Profit on the dashboard.
                </p>
              </div>
              {/* Period filter */}
              <div className="flex flex-wrap items-center gap-1.5 bg-[#FAFAFA] border border-black/10 rounded-xl p-1">
                {(
                  [
                    ["today", "Today"],
                    ["week", "Week"],
                    ["month", "Month"],
                    ["year", "Year"],
                    ["all", "All"],
                    ["custom", "Custom"],
                  ] as [PeriodKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setExpensePeriod(key)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      expensePeriod === key
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "text-[#000000] hover:bg-black/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {expensePeriod === "custom" && (
              <div className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-black/10 rounded-xl p-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={expenseStartDate}
                    onChange={(e) => setExpenseStartDate(e.target.value)}
                    className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={expenseEndDate}
                    onChange={(e) => setExpenseEndDate(e.target.value)}
                    className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl p-5 shadow-sm text-white bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent)_55%,#000000)]">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                    Total Expenses
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="text-2xl font-black">
                  ₹
                  {expenseStats.total.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-[9px] text-white/80 font-semibold mt-1 uppercase tracking-wider">
                  {expensePeriod} period
                </div>
              </div>
              <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                    Entries
                  </span>
                  <div className="w-8 h-8 rounded-full bg-tertiary/10 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-tertiary" />
                  </div>
                </div>
                <div className="text-2xl font-black text-[#000000]">
                  {expenseStats.count}
                </div>
                <div className="text-[9px] text-[#000000] font-semibold mt-1">
                  Expenses recorded
                </div>
              </div>
              <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                    Top Category
                  </span>
                  <div className="w-8 h-8 rounded-full bg-tertiary/10 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-tertiary" />
                  </div>
                </div>
                <div className="text-lg font-black text-[#000000] truncate">
                  {expenseStats.topCategory}
                </div>
                <div className="text-[9px] text-[#000000] font-semibold mt-1">
                  Highest spend
                </div>
              </div>
            </div>

            {/* Two-column: add form + category breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
              {/* Add expense form */}
              <div className="lg:col-span-2 bg-white border border-black/10 rounded-2xl p-5 shadow-sm h-fit">
                <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-6 bg-[var(--accent)] rounded-full" />
                  Add Expense
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                      What for?
                    </label>
                    <input
                      type="text"
                      value={expTitle}
                      onChange={(e) => setExpTitle(e.target.value)}
                      placeholder="e.g. October shop rent"
                      className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] placeholder:text-black/30"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={expAmount}
                        onChange={(e) =>
                          setExpAmount(
                            e.target.value === ""
                              ? ""
                              : parseFloat(e.target.value),
                          )
                        }
                        placeholder="0.00"
                        className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] placeholder:text-black/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={expDate}
                        onChange={(e) => setExpDate(e.target.value)}
                        className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                      Category
                    </label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__custom__">+ Custom category…</option>
                    </select>
                  </div>
                  {expCategory === "__custom__" && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                        Custom category name
                      </label>
                      <input
                        type="text"
                        value={expCustomCategory}
                        onChange={(e) => setExpCustomCategory(e.target.value)}
                        placeholder="e.g. Festival decorations"
                        className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] placeholder:text-black/30"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                      Paid via
                    </label>
                    <select
                      value={expPaymentMode}
                      onChange={(e) => setExpPaymentMode(e.target.value)}
                      className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                    >
                      {EXPENSE_PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1">
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={expNotes}
                      onChange={(e) => setExpNotes(e.target.value)}
                      placeholder="Reference / supplier / bill no."
                      className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[var(--accent)] placeholder:text-black/30"
                    />
                  </div>
                  <button
                    onClick={handleAddExpense}
                    disabled={isSavingExpense}
                    className="w-full mt-1 bg-[var(--accent)] hover:bg-[#27272A] disabled:opacity-60 text-white py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingExpense ? "Saving…" : "Add Expense"}
                  </button>
                </div>
              </div>

              {/* Category breakdown */}
              <div className="lg:col-span-3 bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-6 bg-[var(--accent)] rounded-full" />
                  Spend by Category
                </h3>
                {expenseStats.categoryBreakdown.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-14 h-14 rounded-full bg-tertiary/10 flex items-center justify-center mx-auto mb-4">
                      <PiggyBank className="w-7 h-7 text-tertiary" />
                    </div>
                    <p className="text-sm font-bold text-[#000000]">
                      No expenses in this period yet.
                    </p>
                    <p className="text-xs font-semibold text-[#000000]/60 mt-1">
                      Add your first expense to see the breakdown.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenseStats.categoryBreakdown.map((row) => {
                      const max = expenseStats.categoryBreakdown[0].amount || 1;
                      const pct = expenseStats.total
                        ? (row.amount / expenseStats.total) * 100
                        : 0;
                      return (
                        <div key={row.category}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-[#000000] flex items-center gap-1.5">
                              <Tag className="w-3 h-3 text-tertiary" />
                              {row.category}
                            </span>
                            <span className="text-xs font-black text-[#000000]">
                              ₹
                              {row.amount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              <span className="text-[10px] font-bold text-[#000000]/50 ml-1.5">
                                {pct.toFixed(0)}%
                              </span>
                            </span>
                          </div>
                          <div className="h-2.5 bg-black/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent-strong)] rounded-full transition-all duration-700"
                              style={{ width: `${(row.amount / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Expenses list */}
            <div className="bg-white border border-black/10 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 border-b border-black/10">
                <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2">
                  <List className="w-4 h-4 text-[var(--accent)]" />
                  Expense Log
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-xs font-bold text-[#000000] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    <option value="ALL">All categories</option>
                    {expenseStats.allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-black/30 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={expenseSearch}
                      onChange={(e) => setExpenseSearch(e.target.value)}
                      placeholder="Search expenses…"
                      className="bg-[#FAFAFA] border border-black/10 rounded-lg pl-8 pr-3 py-2 text-xs text-[#000000] focus:outline-none focus:border-[var(--accent)] placeholder:text-black/30 w-44"
                    />
                  </div>
                </div>
              </div>

              {expenseStats.filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-tertiary/10 flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-7 h-7 text-tertiary" />
                  </div>
                  <p className="text-sm font-bold text-[#000000]">
                    No expenses found.
                  </p>
                  <p className="text-xs font-semibold text-[#000000]/60 mt-1">
                    Try a different period or add a new expense.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[720px]">
                    <thead className="bg-[#FAFAFA] border-b border-black/10 select-none">
                      <tr>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Date
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Expense
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Category
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Paid via
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">
                          Amount
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-center">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseStats.filtered.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-black/5 hover:bg-[#FAFAFA] transition-colors"
                        >
                          <td className="p-3 text-xs font-semibold text-[#000000] whitespace-nowrap">
                            {new Date(e.expense_date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="p-3">
                            <p className="text-sm font-bold text-[#000000]">
                              {e.title}
                            </p>
                            {e.notes && (
                              <p className="text-[10px] text-[#000000]/50 font-semibold mt-0.5">
                                {e.notes}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#000000] bg-black/5 border border-black/10 px-2 py-1 rounded-full uppercase tracking-wider">
                              <Tag className="w-2.5 h-2.5" />
                              {e.category}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#000000]/70">
                              <Banknote className="w-3 h-3" />
                              {e.payment_mode}
                            </span>
                          </td>
                          <td className="p-3 text-right text-sm font-black text-[#B91C1C] whitespace-nowrap">
                            − ₹
                            {e.amount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleDeleteExpense(e.id)}
                              title="Delete expense"
                              className="inline-flex items-center justify-center w-8 h-8 bg-[#B91C1C]/10 hover:bg-[#B91C1C]/20 text-[#B91C1C] rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#FAFAFA] border-t border-black/10">
                        <td
                          colSpan={4}
                          className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right"
                        >
                          Total ({expensePeriod})
                        </td>
                        <td className="p-3 text-right text-sm font-black text-[#B91C1C] whitespace-nowrap">
                          − ₹
                          {expenseStats.total.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {role === "admin" && activeTab === "inventory" && (
          <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight flex items-center gap-3">
                  <Boxes className="w-7 h-7 text-[var(--accent)]" />
                  Inventory
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  Manage products and categories — add, edit and delete.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="relative flex-1 lg:flex-none">
                  <Search className="w-3.5 h-3.5 text-[#000000]/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search products…"
                    className="pl-9 pr-3 py-2 bg-white border border-black/10 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--accent)] w-full lg:w-48"
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={exportInventoryCSV}
                  className="text-[10px] font-bold text-[#000000] bg-white border border-black/10 hover:bg-[#FAFAFA] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> Inventory CSV
                </button>
                <button
                  onClick={() => {
                    setNewCategoryName("");
                    setEditingCategoryId(null);
                    setEditCategoryName("");
                    setShowCategoryModal(true);
                  }}
                  className="text-[10px] font-bold text-[var(--accent)] bg-white border border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" /> Manage Categories
                </button>
                <button
                  onClick={() => {
                    resetCatalogForm();
                    setNewCatType("SERVICE");
                    setEditingCatalogId(null);
                    setCatalogTargetRowId(null);
                    setShowCatalogModal(true);
                  }}
                  className="text-[10px] font-bold text-white bg-[var(--accent-strong)] hover:bg-[#5E423C] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5" /> Add Service
                </button>
                <button
                  onClick={() => {
                    resetCatalogForm();
                    setNewCatType("PRODUCT");
                    setEditingCatalogId(null);
                    setCatalogTargetRowId(null);
                    setShowCatalogModal(true);
                  }}
                  className="text-[10px] font-bold text-white bg-[var(--accent)] hover:bg-[#27272A] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Product
                </button>
              </div>
            </div>

            {inventoryProducts.length === 0 ? (
              <div className="bg-white border border-black/10 rounded-xl p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
                  <Boxes className="w-7 h-7 text-[var(--accent)]" />
                </div>
                <p className="text-base font-bold text-[#000000]">
                  No products yet.
                </p>
                <p className="text-xs font-semibold text-[#000000]/60 mt-1 mb-4">
                  Add your first product or service to start managing your catalog.
                </p>
                <button
                  onClick={() => {
                    resetCatalogForm();
                    setEditingCatalogId(null);
                    setCatalogTargetRowId(null);
                    setShowCatalogModal(true);
                  }}
                  className="text-[10px] font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent)] px-4 py-2 rounded-lg uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add First Product
                </button>
              </div>
            ) : (
              <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="bg-[#FAFAFA] border-b border-black/10 select-none">
                      <tr>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Product
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">
                          Type
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">
                          Stock
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">
                          Price
                        </th>
                        <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {filteredInventory.map((p) => {
                        const isExpanded = expandedProductId === p.id;
                        return (
                          <React.Fragment key={p.id}>
                            <tr
                              className="hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                              onClick={() =>
                                setExpandedProductId(isExpanded ? null : p.id)
                              }
                            >
                              <td className="p-3">
                                <div className="flex items-start gap-2.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedProductId(isExpanded ? null : p.id);
                                    }}
                                    className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                      isExpanded
                                        ? "bg-[var(--accent)] text-white shadow-xs"
                                        : "bg-black/5 hover:bg-black/15 text-black/70 hover:text-black"
                                    }`}
                                    title={
                                      isExpanded
                                        ? "Click to collapse details"
                                        : "Click dropdown to open product details"
                                    }
                                    aria-label="Toggle details dropdown"
                                  >
                                    <ChevronDown
                                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                        isExpanded ? "rotate-180 text-white" : ""
                                      }`}
                                    />
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-[#000000] flex items-center gap-2 flex-wrap">
                                      <span>{p.name}</span>
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedProductId(isExpanded ? null : p.id);
                                        }}
                                        className="text-[9px] text-[var(--accent)] hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"
                                      >
                                        {isExpanded ? "▲ Hide Details" : "▼ Open in detail"}
                                      </span>
                                    </div>
                                    {p.desc && (
                                      <div className="text-[10px] font-semibold text-[#000000]/60 mt-0.5">
                                        {p.desc}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border inline-block ${
                                    p.itemType === "SERVICE"
                                      ? "text-[var(--accent-strong)] bg-[var(--accent-strong)]/10 border-[var(--accent-strong)]/25"
                                      : "text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/25"
                                  }`}
                                >
                                  {p.itemType === "SERVICE" ? "Service" : "Product"}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {p.itemType === "SERVICE" ? (
                                  <span className="text-[10px] font-semibold text-[#000000]/35">
                                    —
                                  </span>
                                ) : (
                                  (() => {
                                    const stock = Number(p.stock) || 0;
                                    const alertAt = p.lowStockAlert;
                                    const isLow =
                                      alertAt !== null &&
                                      alertAt !== undefined &&
                                      stock <= Number(alertAt);
                                    return (
                                      <span
                                        className={`text-sm font-black ${
                                          isLow ? "text-[#B91C1C]" : "text-[#000000]"
                                        }`}
                                      >
                                        {stock}
                                        {isLow && (
                                          <span className="text-[9px] font-bold uppercase tracking-wider ml-1">
                                            Low
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()
                                )}
                              </td>
                              <td className="p-3 text-right text-sm font-black text-[#000000]">
                                ₹
                                {(p.price ?? 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                                {(p.offerPct ?? 0) > 0 && (
                                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#15803D]">
                                    −{p.offerPct}% → ₹
                                    {(p.offerPrice ?? 0).toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <div
                                  className="flex justify-end gap-1.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 ${
                                      isExpanded
                                        ? "bg-[var(--accent)] text-white shadow-xs"
                                        : "text-[var(--accent)] hover:bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                                    }`}
                                    title={
                                      isExpanded
                                        ? "Collapse product details"
                                        : "Open product details"
                                    }
                                  >
                                    <ChevronDown
                                      className={`w-3 h-3 transition-transform duration-200 ${
                                        isExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                    {isExpanded ? "Close" : "Details"}
                                  </button>
                                  <button
                                    onClick={() => openEditCatalog(p)}
                                    className="text-[10px] font-bold text-[var(--accent)] hover:text-white hover:bg-[var(--accent)] border border-[var(--accent)]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                  {p.itemType !== "SERVICE" && (
                                    <button
                                      onClick={() => openStockAdjust(p)}
                                      className="text-[10px] font-bold text-black/70 hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 border border-black/15 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                      title="Adjust stock — restock, return, loss or reconcile"
                                    >
                                      <SlidersHorizontal className="w-3 h-3" /> Stock
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `Delete "${p.name}" from inventory? This cannot be undone.`,
                                        )
                                      ) {
                                        deleteFromCatalog(p.id);
                                      }
                                    }}
                                    className="text-[10px] font-bold text-[#DC2626] hover:text-white hover:bg-[#DC2626] border border-[#DC2626]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-[#FAFAFA] border-b border-black/5">
                                <td colSpan={3} className="p-4">
                                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-black/5">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                                        <h4 className="text-xs font-black text-black uppercase tracking-wider">
                                          Product Detail — {p.name}
                                        </h4>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => openEditCatalog(p)}
                                          className="text-[10px] font-bold text-white bg-[var(--accent)] hover:bg-[#27272A] px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                        >
                                          <Pencil className="w-3 h-3" /> Edit
                                        </button>
                                        {p.itemType !== "SERVICE" && (
                                          <button
                                            onClick={() => openStockAdjust(p)}
                                            className="text-[10px] font-bold text-black bg-white hover:bg-[var(--accent)] hover:text-white border border-black/15 px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                                            title="Adjust stock — restock, return, loss or reconcile"
                                          >
                                            <SlidersHorizontal className="w-3 h-3" /> Adjust Stock
                                          </button>
                                        )}
                                        <button
                                          onClick={() => setExpandedProductId(null)}
                                          className="text-[10px] font-bold text-black/70 hover:text-black bg-black/5 hover:bg-black/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                        >
                                          Close
                                        </button>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                                      <div>
                                        <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                          Selling Price
                                        </div>
                                        <div className="font-black text-black">
                                          ₹
                                          {(p.price ?? 0).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                          Category
                                        </div>
                                        <div className="font-bold text-black">
                                          {p.category || "General"}
                                        </div>
                                      </div>
                                      {p.desc && (
                                        <div className="col-span-2 sm:col-span-3">
                                          <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                            Description
                                          </div>
                                          <div className="font-semibold text-black/70">
                                            {p.desc}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {filteredInventory.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="p-8 text-center text-xs font-semibold text-[#000000]/60"
                          >
                            No products match &quot;{inventorySearch}&quot;.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#FFFFFF] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-6 border-b border-black/10 flex justify-between items-center bg-[#FFFFFF]">
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">
                    Order Details
                  </h3>
                  <p className="text-sm text-[#000000] font-medium mt-1">
                    {selectedOrder.id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors group cursor-pointer"
                >
                  <X className="w-5 h-5 text-[#000000] group-hover:text-tertiary transition-colors" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Customer Name
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.customerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Contact Number
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.customerPhone || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Address
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.customerAddress || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Order Source
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.source}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Bill Type
                    </div>
                    <span
                      className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${selectedOrder.isGst ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-black/5 text-[#111827]"}`}
                    >
                      {selectedOrder.isGst ? "GST Invoice" : "Non-GST Bill"}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Date & Time
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {new Date(selectedOrder.date).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mb-4 text-[11px] font-bold text-[#000000] uppercase tracking-[0.1em] border-b border-black/10 pb-2">
                  Order Items
                </div>
                <div className="space-y-3 mb-8">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center"
                    >
                      <div>
                        <div className="text-sm font-bold text-[#000000]">
                          {item.name}
                        </div>
                        {item.desc && (
                          <div className="text-[10px] text-[#000000] font-medium">
                            {item.desc}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#000000]">
                          ₹{(item.price * item.qty).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-[#000000] font-medium">
                          {item.qty} x ₹{item.price.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-black/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#000000] font-semibold">
                      Subtotal
                    </span>
                    <span className="text-[#000000] font-bold">
                      ₹{selectedOrder.subtotal.toLocaleString()}
                    </span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#000000] font-semibold">
                        Discount
                      </span>
                      <span className="text-[#27272A] font-bold">
                        -₹{selectedOrder.discount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {(selectedOrder.gstAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#000000] font-semibold">
                        GST ({selectedOrder.gstPercentage ?? 0}%)
                      </span>
                      <span className="text-[#000000] font-bold">
                        ₹{(selectedOrder.gstAmount ?? 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#000000] font-semibold">
                        Delivery Fee
                      </span>
                      <span className="text-[#000000] font-bold">
                        ₹{selectedOrder.deliveryFee.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg pt-2 mt-2 border-t border-transparent">
                    <span className="text-[#000000] font-black uppercase tracking-tight">
                      Total{" "}
                    </span>
                    <span className="text-[var(--accent)] font-black">
                      ₹{selectedOrder.grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Modal */}
        {activeInvoiceId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[400] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[92vh] sm:h-[88vh] flex flex-col overflow-hidden border border-neutral-300 transform scale-100 animate-in zoom-in-95 duration-150">
              <div className="px-4 py-2.5 flex justify-between items-center bg-neutral-900 text-white border-b border-neutral-800 shrink-0">
                <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2 text-white">
                  <Printer className="w-3.5 h-3.5 text-neutral-300" />
                  <span>Invoice Preview • #{activeInvoiceId}</span>
                </h3>
                <div className="flex items-center gap-2">
                  <a
                    href={`/invoice/${activeInvoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-neutral-300 hover:text-white px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
                  >
                    Open Full Page ↗
                  </a>
                  <button
                    onClick={() => setActiveInvoiceId(null)}
                    className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full bg-neutral-100 overflow-hidden relative">
                <iframe
                  src={`/invoice/${activeInvoiceId}?embed=true`}
                  className="w-full h-full border-none absolute inset-0"
                  title={`Invoice ${activeInvoiceId}`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Print Settings Modal */}
        {printModalData && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
              <div className="bg-neutral-900 px-5 py-4 flex items-center justify-between border-b border-neutral-800">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <Printer className="w-4 h-4 text-neutral-300" />
                  Print Settings
                </h3>
                <button
                  onClick={() => setPrintModalData(null)}
                  className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-black text-black uppercase tracking-wider mb-3">Printer Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPrintPrefs({ ...printPrefs, paper: "thermal", size: printPrefs.size === "a4" || printPrefs.size === "a5" ? "80" : printPrefs.size })}
                      className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer ${printPrefs.paper === "thermal" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}
                    >
                      <span className="font-bold text-sm">Thermal Roll</span>
                    </button>
                    <button
                      onClick={() => setPrintPrefs({ ...printPrefs, paper: "a4", size: printPrefs.size === "58" || printPrefs.size === "80" ? "a4" : printPrefs.size })}
                      className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer ${printPrefs.paper === "a4" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}
                    >
                      <span className="font-bold text-sm">Sheet (A4/A5)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-black uppercase tracking-wider mb-3">Paper Size</label>
                  <div className="grid grid-cols-2 gap-3">
                    {printPrefs.paper === "thermal" ? (
                      <>
                        <button onClick={() => setPrintPrefs({ ...printPrefs, size: "58" })} className={`py-2 rounded-lg border-2 font-bold text-xs transition-all cursor-pointer ${printPrefs.size === "58" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}>58 mm</button>
                        <button onClick={() => setPrintPrefs({ ...printPrefs, size: "80" })} className={`py-2 rounded-lg border-2 font-bold text-xs transition-all cursor-pointer ${printPrefs.size === "80" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}>80 mm</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setPrintPrefs({ ...printPrefs, size: "a4" })} className={`py-2 rounded-lg border-2 font-bold text-xs transition-all cursor-pointer ${printPrefs.size === "a4" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}>A4 Sheet</button>
                        <button onClick={() => setPrintPrefs({ ...printPrefs, size: "a5" })} className={`py-2 rounded-lg border-2 font-bold text-xs transition-all cursor-pointer ${printPrefs.size === "a5" ? "border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]" : "border-neutral-200 hover:border-neutral-300 text-neutral-600"}`}>A5 Sheet</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-neutral-50 px-6 py-4 flex justify-end border-t border-neutral-200 gap-3">
                <button
                  onClick={() => setPrintModalData(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem("shalistone_print_prefs", JSON.stringify(printPrefs));
                    const baseUrl = printModalData.type === "invoice" ? `/invoice/${printModalData.id}` : `/advance/${printModalData.id}`;
                    window.open(`${baseUrl}?print=true&paper=${printPrefs.paper}&size=${printPrefs.size}`, "_blank");
                    setPrintModalData(null);
                  }}
                  className="px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-[var(--accent)] hover:bg-[#254659] text-white shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings tab (admin only) ─────────────────────────────── */}
        {role === "admin" && activeTab === "settings" && (
          <SettingsPanel
            shop={shopSettings}
            products={catalog.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.desc ?? null,
              category: c.category ?? "General",
              gst_rate: c.gstRate ?? 0,
              hsn_code: c.hsnCode ?? null,
              selling_price: c.price ?? 0,
              item_type: c.itemType ?? "PRODUCT",
              cost_price: c.costPrice ?? 0,
              current_stock: c.stock ?? null,
              low_stock_alert: c.lowStockAlert ?? null,
              offer_discount_pct: c.offerPct ?? 0,
              offer_price: c.offerPrice ?? null,
              is_active: c.isActive ?? true,
              created_at: "",
            }))}
            categories={categories}
            onSaved={setShopSettings}
            onCatalogueChanged={fetchData}
            onOpenInventory={openInventory}
          />
        )}

        {/* Classy Footer */}
        <footer className="mt-auto pt-10 pb-2 border-t border-black/10 flex flex-col md:flex-row justify-between items-center text-[10px] text-[#000000] font-semibold uppercase tracking-wider gap-4">
          <div className="text-[#000000]">
            © {new Date().getFullYear()} All Rights Reserved. {shopSettings.shop_name}.
          </div>
          <div>
            Powered By{" "}
            <a
              href="https://www.cenexasystems.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline font-bold transition-all"
            >
              Cenexa Systems
            </a>{" "}
            @2026
          </div>
          <div className="italic text-tertiary font-bold tracking-[0.15em] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full"></span>
            {shopSettings.tagline || "Tailoring • Designer Wear • Alterations • Embroidery"}
          </div>
        </footer>
      </main>

      {lowStockAlarm && (
        <LowStockAlarm
          items={lowStockAlarm.items}
          sounding={lowStockAlarm.sounding}
          onAcknowledge={acknowledgeLowStock}
        />
      )}
    </div>
  );
}
