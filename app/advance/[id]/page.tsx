import { dbStore, advanceBill } from "@/lib/dbStore";
import { getShopSettings, shopLogoSrc, formatPhone } from "@/lib/shopSettings";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { AdvanceReceiptActions } from "./AdvanceReceiptActions";

export default async function AdvanceReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const isEmbed = resolvedSearchParams.embed === "true";
  const autoPrint = resolvedSearchParams.print === "true";
  const paper = resolvedSearchParams.paper === "thermal" ? "thermal" : "a4";
  const size = typeof resolvedSearchParams.size === "string" ? resolvedSearchParams.size : "a4";

  const advance = await dbStore.getAdvanceOrder(id);
  const shop = await getShopSettings();
  const shopLogo = shopLogoSrc(shop);
  const shopPhone = formatPhone(shop.phone);

  if (!advance) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center font-sans text-zinc-800">
        <div className="w-12 h-12 rounded-lg border border-zinc-200 bg-white flex items-center justify-center mb-3 text-zinc-500 shadow-xs">
          <FileText className="w-6 h-6" />
        </div>
        <h1 className="text-base font-semibold text-zinc-900 mb-1">
          Advance Order Not Found
        </h1>
        <p className="text-xs text-zinc-500 max-w-sm mb-5">
          The requested advance order #{id} could not be found.
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

  const totalNum = Number(advance.total_amount) || 0;
  const depositNum = Number(advance.deposit_amount) || 0;
  const balanceNum = Math.max(0, totalNum - depositNum);
  const bill = advanceBill(advance);
  const bookedGst = bill.isGst
    ? Math.max(0, bill.subtotal - bill.discountAmount) * (bill.gstPercentage / 100)
    : 0;
  const depositLabel =
    advance.deposit_payment_mode === "GPAY" ? "GPay" : "Cash";

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formattedDate = new Date(advance.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const deliveryDate = advance.delivery_date
    ? new Date(advance.delivery_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

  return (
    <div
      className={`min-h-screen bg-zinc-100/70 text-zinc-900 font-sans ${
        isEmbed ? "p-2 sm:p-4" : "py-8 px-3 sm:px-6"
      } flex flex-col items-center print:bg-white print:p-0 print:m-0`}
    >
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
            margin: ${paper === "thermal" ? "3mm" : size === "a5" ? "10mm" : "12mm 10mm"};
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-hidden { display: none !important; }
          .invoice-sheet {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {!isEmbed && (
        <div className="w-full max-w-[760px] mb-4 print:hidden">
          <AdvanceReceiptActions
            advanceId={advance.id}
            customerName={advance.customer_name}
            customerPhone={advance.customer_phone}
            total={totalNum}
            deposit={depositNum}
            balance={balanceNum}
            autoPrint={autoPrint}
            shopName={shop.shop_name}
          />
        </div>
      )}

      {paper === "thermal" ? (
        <div className={`invoice-sheet bg-white mx-auto text-black font-mono leading-tight p-3 ${size === "58" ? "w-[260px]" : "w-[320px]"}`}>
          <div className="text-center pb-3 border-b border-dashed border-black/40 mb-3">
            <h1 className="text-xl font-bold tracking-tight">{shop.shop_name}</h1>
            {shop.address && <p className="text-[11px] mt-1">{shop.address}</p>}
            {shopPhone && <p className="text-[11px]">Ph: {shopPhone}</p>}
          </div>
          <div className="text-[11px] pb-3 border-b border-dashed border-black/40 mb-3 space-y-1">
            <div className="flex justify-between">
              <span className="font-bold">ADVANCE RECEIPT</span>
              <span>#{advance.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{formattedDate}</span>
            </div>
            {deliveryDate && (
              <div className="flex justify-between">
                <span>Delivery:</span>
                <span>{deliveryDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-semibold text-right">{advance.customer_name || "Guest"}</span>
            </div>
            {advance.customer_phone && (
              <div className="flex justify-between">
                <span>Phone:</span>
                <span>{advance.customer_phone}</span>
              </div>
            )}
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
                {advance.items.map((item, i) => (
                  <tr key={i} className="border-b border-dashed border-black/15">
                    <td className="py-1.5 pr-1 font-semibold">{item.snapshot_name}</td>
                    <td className="py-1.5 text-center">{item.quantity}</td>
                    <td className="py-1.5 text-right font-medium">
                      {fmt(Number(item.quantity) * Number(item.snapshot_price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] py-3 border-b border-dashed border-black/40 mb-3 space-y-1.5">
            {(bill.discountAmount > 0 || bookedGst > 0 || bill.deliveryFee > 0) && (
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{fmt(bill.subtotal)}</span>
              </div>
            )}
            {bill.discountAmount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{fmt(bill.discountAmount)}</span>
              </div>
            )}
            {bookedGst > 0 && (
              <div className="flex justify-between">
                <span>GST ({bill.gstPercentage}%):</span>
                <span>{fmt(bookedGst)}</span>
              </div>
            )}
            {bill.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Delivery:</span>
                <span>{fmt(bill.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span>Order Total:</span>
              <span>₹{fmt(totalNum)}</span>
            </div>
            <div className="flex justify-between">
              <span>Deposit Paid ({depositLabel}):</span>
              <span>-₹{fmt(depositNum)}</span>
            </div>
            <div className="flex justify-between text-[14px] font-black mt-2 pt-1 border-t border-dashed border-black/40">
              <span>BALANCE DUE:</span>
              <span>₹{fmt(balanceNum)}</span>
            </div>
          </div>
          {advance.notes && (
            <p className="text-[10px] mb-3">Notes: {advance.notes}</p>
          )}
          <div className="text-[10px] text-center space-y-0.5">
            <p>This is an advance receipt, not a final invoice.</p>
            <p>Balance payable on or before delivery.</p>
          </div>
          <div className="text-[11px] text-center pt-2 font-semibold italic">
            Thank you for your order!
          </div>
        </div>
      ) : (
      <div className="invoice-sheet w-full max-w-[760px] bg-white border border-zinc-200/80 shadow-xs rounded-sm p-6 sm:p-12 text-zinc-900 print:border-none print:shadow-none print:p-0 print:rounded-none">
        {/* Header */}
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
              <div className="text-xs text-zinc-600 pt-1">
                {shopPhone && <p>Phone: {shopPhone}</p>}
              </div>
            </div>
          </div>

          <div className="sm:text-right space-y-1.5 shrink-0">
            <div>
              <span className="text-lg font-bold tracking-tight text-[var(--accent)] uppercase">
                Advance Receipt
              </span>
              <p className="text-xs font-mono text-zinc-500">#{advance.id}</p>
            </div>
            <div className="text-xs text-zinc-600 space-y-0.5 pt-1">
              <div>
                <span className="text-zinc-400">Date: </span>
                <span className="text-zinc-800 font-medium">{formattedDate}</span>
              </div>
              <div>
                <span className="text-zinc-400">Status: </span>
                <span className="text-zinc-800 font-medium uppercase">
                  {advance.status}
                </span>
              </div>
              {deliveryDate && (
                <div>
                  <span className="text-zinc-400">Delivery: </span>
                  <span className="text-zinc-700">{deliveryDate}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Billed To */}
        <div className="py-5 border-b border-zinc-200 text-xs">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Customer
          </div>
          <div className="text-sm font-semibold text-zinc-900">
            {advance.customer_name?.trim() ? advance.customer_name : "Counter Customer"}
          </div>
          {advance.customer_phone && (
            <div className="text-xs text-zinc-600 font-mono mt-0.5">
              +91 {advance.customer_phone}
            </div>
          )}
          {advance.customer_address && (
            <div className="text-xs text-zinc-600 mt-0.5 max-w-[260px]">
              {advance.customer_address}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="py-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <th className="pb-3 w-8 text-center">#</th>
                <th className="pb-3">Item Description</th>
                <th className="pb-3 text-center w-12">Qty</th>
                <th className="pb-3 text-right w-24">Rate (₹)</th>
                <th className="pb-3 text-right w-28">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {advance.items.map((item, index) => {
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
                      {item.snapshot_desc && (
                        <div className="text-[10px] text-zinc-500">
                          {item.snapshot_desc}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center text-zinc-800 font-medium">
                      {item.quantity}
                    </td>
                    <td className="py-3 text-right font-mono text-zinc-600">
                      {fmt(unitPrice)}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-zinc-900">
                      {fmt(itemTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-zinc-200 pt-4 flex flex-col sm:flex-row justify-between items-start gap-8 text-xs">
          <div className="space-y-4 max-w-sm">
            <div className="text-[11px] text-zinc-500 leading-relaxed">
              <p className="font-medium text-zinc-700 mb-0.5">Please note:</p>
              <p>• This is an advance-order deposit receipt, not a final tax invoice.</p>
              <p>• The balance is payable on or before delivery/collection.</p>
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs">
            {(bill.discountAmount > 0 || bookedGst > 0 || bill.deliveryFee > 0) && (
              <>
                <div className="flex justify-between text-zinc-600">
                  <span>Items Subtotal</span>
                  <span className="font-mono text-zinc-900">₹{fmt(bill.subtotal)}</span>
                </div>
                {bill.discountAmount > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>
                      Discount{bill.discountType === "PERCENT" && bill.discountValue > 0 ? ` (${bill.discountValue}%)` : ""}
                    </span>
                    <span className="font-mono text-zinc-900">− ₹{fmt(bill.discountAmount)}</span>
                  </div>
                )}
                {bookedGst > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>GST ({bill.gstPercentage}%)</span>
                    <span className="font-mono text-zinc-900">₹{fmt(bookedGst)}</span>
                  </div>
                )}
                {bill.deliveryFee > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery Fee</span>
                    <span className="font-mono text-zinc-900">₹{fmt(bill.deliveryFee)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between text-zinc-600 font-semibold">
              <span>Order Total</span>
              <span className="font-mono text-zinc-900">₹{fmt(totalNum)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Deposit Paid ({depositLabel})</span>
              <span className="font-mono text-zinc-900">− ₹{fmt(depositNum)}</span>
            </div>
            <div className="border-t-2 border-[var(--accent)] pt-2.5 mt-2 flex justify-between items-baseline">
              <span className="text-sm font-bold text-[var(--accent)] uppercase">
                Balance Due
              </span>
              <span className="font-mono text-lg font-bold text-[var(--accent)]">
                ₹{fmt(balanceNum)}
              </span>
            </div>
          </div>
        </div>

        {advance.notes && (
          <div className="mt-6 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-700">Notes: </span>
            {advance.notes}
          </div>
        )}

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
