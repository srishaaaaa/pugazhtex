"use client";

import { useEffect } from "react";
import { Printer, MessageCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface AdvanceReceiptActionsProps {
  advanceId: string;
  customerName?: string;
  customerPhone?: string;
  total: number;
  deposit: number;
  balance: number;
  autoPrint?: boolean;
  shopName?: string;
}

export function AdvanceReceiptActions({
  advanceId,
  customerName,
  customerPhone,
  total,
  deposit,
  balance,
  autoPrint,
  shopName,
}: AdvanceReceiptActionsProps) {
  useEffect(() => {
    if (autoPrint && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const handleWhatsAppShare = () => {
    if (typeof window === "undefined") return;
    const currentUrl = window.location.href.split("?")[0];
    const cleanPhone = (customerPhone || "").replace(/\D/g, "").slice(-10);
    const fmt = (n: number) =>
      n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
    const text =
      `*${shopName || "Sri Sakthi Pugazh Tex"}*\nAdvance Order Receipt #${advanceId}\n` +
      `Customer: ${customerName || "Counter Customer"}\n\n` +
      `Order Total: ₹${fmt(total)}\n` +
      `Deposit Paid: ₹${fmt(deposit)}\n` +
      `Balance Due: ₹${fmt(balance)}\n\n` +
      `Receipt Link:\n${currentUrl}`;
    const encoded = encodeURIComponent(text);
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank");
  };

  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-3 bg-white border border-zinc-200/80 rounded-sm p-3 shadow-xs print:hidden">
      <Link
        href="/pos"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 px-3 py-1.5 rounded-sm bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to POS</span>
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleWhatsAppShare}
          type="button"
          title="Share receipt on WhatsApp"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 hover:text-zinc-950 px-3 py-1.5 rounded-sm bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors cursor-pointer"
        >
          <MessageCircle className="w-3.5 h-3.5 text-zinc-600" />
          <span>Share WhatsApp</span>
        </button>
        <button
          onClick={handlePrint}
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-1.5 rounded-sm bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print</span>
        </button>
      </div>
    </div>
  );
}
