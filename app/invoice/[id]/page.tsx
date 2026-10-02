import { dbStore } from "@/lib/dbStore";
import { getShopSettings, shopLogoSrc, formatPhone } from "@/lib/shopSettings";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { InvoiceActions } from "./InvoiceActions";

// Clean Indian Number-to-Words Converter
function numberToWords(num: number): string {
  if (!num || num === 0) return "Zero Rupees Only";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const formatChunk = (n: number): string => {
    let str = "";
    if (n >= 100) {
      str += a[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      str +=
        b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "") + " ";
    } else if (n > 0) {
      str += a[n] + " ";
    }
    return str.trim();
  };

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

  let result = "";
  let n = integerPart;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore > 0) result += formatChunk(crore) + " Crore ";
  if (lakh > 0) result += formatChunk(lakh) + " Lakh ";
  if (thousand > 0) result += formatChunk(thousand) + " Thousand ";
  if (hundred > 0) result += formatChunk(hundred) + " ";

  result = result.trim();
  if (!result) result = "Zero";

  let out = result + " Rupees";
  if (decimalPart > 0) {
    out += " and " + formatChunk(decimalPart) + " Paise";
  }
  return out + " Only";
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const isEmbed = resolvedSearchParams.embed === "true";
  const isPrint = resolvedSearchParams.print === "true";
  const paper = resolvedSearchParams.paper || "a4";
  const size = resolvedSearchParams.size || "a4";

  const order = await dbStore.getOrderWithRelations(id);
  const shop = await getShopSettings();
  const shopLogo = shopLogoSrc(shop);
  const shopPhone = formatPhone(shop.phone);

  if (!order) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center font-sans text-zinc-800">
        <div className="w-12 h-12 rounded-lg border border-zinc-200 bg-white flex items-center justify-center mb-3 text-zinc-500 shadow-xs">
          <FileText className="w-6 h-6" />
        </div>
        <h1 className="text-base font-semibold text-zinc-900 mb-1">
          Invoice Not Found
        </h1>
        <p className="text-xs text-zinc-500 max-w-sm mb-5">
          The requested invoice identifier #{id} could not be found.
        </p>
        <Link
          href="/pos"
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-md text-white font-medium text-xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const grandTotalNum = Number(order.grand_total) || 0;
  const subtotalNum = Number(order.subtotal) || 0;
  const discountNum = Number(order.discount_amount) || 0;
  const gstAmountNum = Number(order.gst_amount) || 0;
  const deliveryFeeNum = Number(order.delivery_fee) || 0;
  const cashReceivedNum = Number(order.cash_received) || 0;
  const splitCashNum = Number(order.split_cash) || 0;
  const splitGpayNum = Number(order.split_gpay) || 0;
  const changeReturned =
    cashReceivedNum > grandTotalNum ? cashReceivedNum - grandTotalNum : 0;

  const paymentLabel =
    order.payment_mode === "SPLIT"
      ? "Split · Cash + GPay"
      : order.payment_mode === "GPAY"
        ? "GPay"
        : "Cash";

  // Bills saved before the switch to GST-exclusive pricing have GST embedded in
  // the subtotal: their total is subtotal - discount + delivery with no GST added.
  const gstIncluded =
    order.is_gst &&
    gstAmountNum > 0 &&
    Math.abs(subtotalNum - discountNum + deliveryFeeNum - grandTotalNum) < 0.01;
  const taxableValueNum = Math.max(0, subtotalNum - discountNum);

  const halfGstRate = order.gst_percentage ? order.gst_percentage / 2 : 9;
  const halfGstAmount = gstAmountNum > 0 ? gstAmountNum / 2 : 0;

  const formattedDate = new Date(order.bill_date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const formattedTime = new Date(order.created_at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  return (
    <div
      className={`min-h-screen bg-zinc-100/70 text-zinc-900 font-sans ${
        isEmbed ? "p-2 sm:p-4" : "py-8 px-3 sm:px-6"
      } flex flex-col items-center print:bg-white print:p-0 print:m-0`}
    >
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          @page {
            size: ${
              paper === "thermal"
                ? size === "58"
                  ? "58mm auto"
                  : "80mm auto"
                : size === "a5"
                  ? "A5 portrait"
                  : "A4 portrait"
            };
            margin: ${paper === "thermal" ? "3mm" : size === "a5" ? "10mm" : "12mm"};
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-hidden {
            display: none !important;
          }
          .invoice-sheet {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Top Action Toolbar (Hidden in print and embed) */}
      {!isEmbed && (
        <div className="w-full max-w-[760px] mb-4 print:hidden">
          <InvoiceActions
            orderId={order.id}
            customerName={order.customer_name}
            customerPhone={order.customer_phone}
            grandTotal={grandTotalNum}
            isGst={order.is_gst}
            autoPrint={isPrint}
            shopName={shop.shop_name}
          />
        </div>
      )}

      {paper === "thermal" ? (
        <div className={`invoice-sheet bg-white mx-auto text-black font-mono leading-tight p-3 ${size === "58" ? "w-[260px]" : "w-[320px]"}`}>
          {/* Thermal Receipt Layout */}
          <div className="text-center pb-3 border-b border-dashed border-black/40 mb-3">
            <h1 className="text-xl font-bold tracking-tight">{shop.shop_name}</h1>
            {shop.address && <p className="text-[11px] mt-1">{shop.address}</p>}
            {shopPhone && <p className="text-[11px]">Ph: {shopPhone}</p>}
            {order.is_gst && <p className="text-[11px] font-bold mt-1">GSTIN: {shop.gstin || "—"}</p>}
          </div>
          <div className="text-[11px] pb-3 border-b border-dashed border-black/40 mb-3 space-y-1">
            <div className="flex justify-between">
              <span className="font-bold">{order.is_gst ? "TAX INVOICE" : "INVOICE"}</span>
              <span>#{order.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{formattedDate} {formattedTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-semibold text-right">{order.customer_name || "Counter Sale"}</span>
            </div>
          </div>
          <div className="text-[11px] w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-dashed border-black/40">
                  <th className="py-1 font-bold">Item</th>
                  <th className="py-1 font-bold text-center">Qty</th>
                  <th className="py-1 font-bold text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {order.items.map((item, i) => (
                  <tr key={i} className="border-b border-dashed border-black/15">
                    <td className="py-1.5 pr-1">
                      <div className="font-semibold">{item.snapshot_name}</div>
                      {Number(item.offer_pct) > 0 && (
                        <div className="text-[9px] text-[#15803D] font-semibold">
                          Offer −{Number(item.offer_pct)}%
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 text-center">{item.quantity}</td>
                    <td className="py-1.5 text-right font-medium">{(item.quantity * Number(item.snapshot_price)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] py-3 border-b border-dashed border-black/40 mb-3 space-y-1.5">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{subtotalNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            {discountNum > 0 && (
              <div className="flex justify-between text-black">
                <span>Discount:</span>
                <span>-{discountNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {order.is_gst && gstAmountNum > 0 && (
              <>
                <div className="flex justify-between">
                  <span>CGST ({halfGstRate}%){gstIncluded ? " incl." : ""}:</span>
                  <span>{halfGstAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST ({halfGstRate}%){gstIncluded ? " incl." : ""}:</span>
                  <span>{halfGstAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            {deliveryFeeNum > 0 && (
              <div className="flex justify-between">
                <span>Delivery:</span>
                <span>{deliveryFeeNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between text-[14px] font-black mt-2 pt-1 border-t border-dashed border-black/40">
              <span>TOTAL:</span>
              <span>₹{grandTotalNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="text-[10px] space-y-1 mb-3">
            <p className="font-semibold text-center border-b border-dashed border-black/20 pb-2 mb-2">{paymentLabel}</p>
            <p className="text-[9px] uppercase tracking-wider text-center text-gray-700">{numberToWords(grandTotalNum)}</p>
          </div>
          <div className="text-[11px] text-center pt-2 font-semibold italic">
            Thank you for your business!
          </div>
        </div>
      ) : (
        <div className="invoice-sheet w-full max-w-[760px] bg-white border border-zinc-200/80 shadow-xs rounded-sm p-6 sm:p-12 text-zinc-900 print:border-none print:shadow-none print:p-0 print:rounded-none">
        {/* Header: Company & Invoice Info */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6 border-b-2 border-[var(--accent)]">
          <div className="flex items-start gap-3.5 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-sm border border-[var(--accent)]/30 overflow-hidden">
              <img
                src={shopLogo}
                alt={shop.shop_name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--accent)]">
                {shop.shop_name}
              </h1>
              {shop.address && (
                <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                  {shop.address}
                </p>
              )}
              <div className="text-xs text-zinc-600 pt-1 space-y-0.5">
                {shopPhone && <p>Phone: {shopPhone}</p>}
                {shop.email && <p>Email: {shop.email}</p>}
                {order.is_gst && (
                  <p className="text-zinc-800 font-medium pt-0.5">
                    GSTIN: <span className="font-mono">{shop.gstin || "—"}</span> • State Code: 33
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="sm:text-right space-y-1.5 shrink-0">
            <div>
              <span className="text-lg font-bold tracking-tight text-[var(--accent)] uppercase">
                {order.is_gst ? "Tax Invoice" : "Invoice"}
              </span>
              <p className="text-xs font-mono text-zinc-500">#{order.id}</p>
            </div>

            <div className="text-xs text-zinc-600 space-y-0.5 pt-1">
              <div>
                <span className="text-zinc-400">Date: </span>
                <span className="text-zinc-800 font-medium">{formattedDate}</span>
              </div>
              <div>
                <span className="text-zinc-400">Time: </span>
                <span className="text-zinc-700">{formattedTime}</span>
              </div>
              <div>
                <span className="text-zinc-400">Payment: </span>
                <span className="text-zinc-800 font-medium uppercase">
                  {paymentLabel} • {order.status}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Channel: </span>
                <span className="text-zinc-700 uppercase">{order.source}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Billed To Details */}
        <div className="py-5 border-b border-zinc-200 flex flex-col sm:flex-row justify-between items-start gap-4 text-xs">
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Billed To
            </div>
            <div className="text-sm font-semibold text-zinc-900">
              {order.customer_name?.trim() ? order.customer_name : "Counter Customer"}
            </div>
            {order.customer_phone ? (
              <div className="text-xs text-zinc-600 font-mono mt-0.5">
                +91 {order.customer_phone}
              </div>
            ) : (
              <div className="text-xs text-zinc-400 italic mt-0.5">
                Walk-in Counter Sale
              </div>
            )}
            {order.customer_address && (
              <div className="text-xs text-zinc-600 mt-0.5 max-w-[200px]">
                {order.customer_address}
              </div>
            )}
          </div>

          <div className="sm:text-right text-xs text-zinc-500">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Place of Supply
            </div>
            <div className="font-medium text-zinc-800">Tamil Nadu (33)</div>
          </div>
        </div>

        {/* Particulars Table */}
        <div className="py-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <th className="pb-3 w-8 text-center">#</th>
                <th className="pb-3">Item Description</th>
                {order.is_gst && <th className="pb-3 text-center w-16">HSN</th>}
                <th className="pb-3 text-center w-12">Qty</th>
                <th className="pb-3 text-right w-24">
                  Rate (₹){gstIncluded && <span className="block text-[8px] font-normal normal-case tracking-normal text-zinc-400">incl. GST</span>}
                </th>
                <th className="pb-3 text-right w-28">
                  Amount (₹){gstIncluded && <span className="block text-[8px] font-normal normal-case tracking-normal text-zinc-400">incl. GST</span>}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {order.items.map((item, index: number) => {
                const unitPrice = Number(item.snapshot_price) || 0;
                const itemTotal = unitPrice * item.quantity;
                return (
                  <tr key={index}>
                    <td className="py-3 text-center text-zinc-400 font-mono">
                      {index + 1}
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-zinc-900">
                        {item.snapshot_name}
                      </div>
                      {Number(item.offer_pct) > 0 && (
                        <div className="text-[10px] text-[#15803D] font-semibold">
                          Offer −{Number(item.offer_pct)}%
                        </div>
                      )}
                    </td>
                    {order.is_gst && (
                      <td className="py-3 text-center font-mono text-zinc-500">
                        8517
                      </td>
                    )}
                    <td className="py-3 text-center text-zinc-800 font-medium">
                      {item.quantity}
                    </td>
                    <td className="py-3 text-right font-mono text-zinc-600">
                      {unitPrice.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-zinc-900">
                      {itemTotal.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals & Breakdown */}
        <div className="border-t border-zinc-200 pt-4 flex flex-col sm:flex-row justify-between items-start gap-8 text-xs">
          {/* Left Side: Amount in Words, Bank / UPI & Terms */}
          <div className="space-y-4 max-w-sm">
            <div>
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">
                Amount in Words
              </div>
              <div className="text-xs font-medium text-zinc-800 italic">
                {numberToWords(grandTotalNum)}
              </div>
            </div>

            {/* Payment details */}
            {(cashReceivedNum > 0 || order.payment_mode === "SPLIT") && (
              <div className="text-xs text-zinc-600 space-y-0.5 pt-1">
                {order.payment_mode === "SPLIT" ? (
                  <>
                    <div>
                      <span className="text-zinc-400">Paid by Cash: </span>
                      <span className="font-mono font-medium text-zinc-800">
                        ₹{splitCashNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Paid by GPay: </span>
                      <span className="font-mono font-medium text-zinc-800">
                        ₹{splitGpayNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Total Received: </span>
                      <span className="font-mono font-medium text-zinc-800">
                        ₹{cashReceivedNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-zinc-400">
                      {order.payment_mode === "GPAY" ? "Paid via GPay: " : "Cash Received: "}
                    </span>
                    <span className="font-mono font-medium text-zinc-800">
                      ₹{cashReceivedNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {changeReturned > 0 && (
                  <div>
                    <span className="text-zinc-400">Change Returned: </span>
                    <span className="font-mono font-medium text-zinc-800">
                      ₹{changeReturned.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Simple Terms */}
            <div className="text-[11px] text-zinc-500 leading-relaxed pt-2">
              <p className="font-medium text-zinc-700 mb-0.5">Terms & Notes:</p>
              <p>• Goods once sold can only be exchanged within 7 days with this invoice.</p>
              <p>• Custom-stitched and altered garments are made to order and are non-returnable.</p>
            </div>
          </div>

          {/* Right Side: Financial Breakdown */}
          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-600">
              <span>
                Subtotal
                {gstIncluded && (
                  <span className="text-[9px] font-semibold text-zinc-400 uppercase ml-1">
                    incl. GST
                  </span>
                )}
              </span>
              <span className="font-mono text-zinc-900">
                ₹{subtotalNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {discountNum > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>
                  Discount {order.discount_type === "PERCENT" ? `(${order.discount_value}%)` : ""}
                </span>
                <span className="font-mono text-zinc-900">
                  − ₹{discountNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {order.is_gst && gstAmountNum > 0 && (
              <>
                {gstIncluded ? (
                  <div className="pt-1 mt-1 border-t border-dashed border-zinc-200 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    GST (included above)
                  </div>
                ) : (
                  <div className="flex justify-between text-zinc-600 pt-1 mt-1 border-t border-dashed border-zinc-200">
                    <span>Taxable Value</span>
                    <span className="font-mono text-zinc-900">
                      ₹{taxableValueNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>CGST ({halfGstRate.toFixed(1)}%)</span>
                  <span className="font-mono text-zinc-800">
                    ₹{halfGstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>SGST ({halfGstRate.toFixed(1)}%)</span>
                  <span className="font-mono text-zinc-800">
                    ₹{halfGstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            )}

            {deliveryFeeNum > 0 && (
              <div className="flex justify-between text-zinc-600 pt-1 border-t border-dashed border-zinc-200">
                <span>Delivery Fee</span>
                <span className="font-mono text-zinc-800">
                  ₹{deliveryFeeNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="border-t-2 border-[var(--accent)] pt-2.5 mt-2 flex justify-between items-baseline">
              <span className="text-sm font-bold text-[var(--accent)] uppercase">
                Total
              </span>
              <span className="font-mono text-lg font-bold text-[var(--accent)]">
                ₹{grandTotalNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Signatory & Machine Note */}
        <div className="mt-12 pt-6 border-t border-[var(--accent)]/30 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 text-xs">
          <div className="text-[11px] text-zinc-400">
            Thank you for your visit! • {shop.shop_name} POS
          </div>

          <div className="sm:text-right space-y-1 self-end">
            <div className="border-b border-zinc-300 w-36 mb-1 ml-auto"></div>
            <div className="font-semibold text-zinc-800 text-xs">
              Authorised Signatory
            </div>
            <div className="text-[10px] text-zinc-400">For {shop.shop_name}</div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
