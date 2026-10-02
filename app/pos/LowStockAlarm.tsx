"use client";

import React from "react";
import { AlertTriangle, Package, Volume2, VolumeX } from "lucide-react";

export type LowStockItem = {
  id: string;
  name: string;
  category?: string;
  stock: number;
  alertAt: number;
};

/** Repeating two-tone beep built with Web Audio, so no sound file is needed. */
function startAlarmSound(): () => void {
  const AudioCtx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) return () => {};

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return () => {};
  }
  ctx.resume().catch(() => {});

  const beep = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.25);
  };

  const ring = () => {
    const t = ctx.currentTime;
    beep(880, t);
    beep(660, t + 0.28);
  };

  ring();
  const timer = window.setInterval(ring, 1400);
  return () => {
    window.clearInterval(timer);
    ctx.close().catch(() => {});
  };
}

export default function LowStockAlarm({
  items,
  sounding,
  onAcknowledge,
}: {
  items: LowStockItem[];
  sounding: boolean;
  onAcknowledge: () => void;
}) {
  React.useEffect(() => {
    if (!sounding) return;
    return startAlarmSound();
  }, [sounding]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
      <div
        role="alertdialog"
        aria-labelledby="low-stock-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#EF4444]/30"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#DC2626] to-[#F97316] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="low-stock-title" className="font-black text-base leading-tight">
                Low Stock Alarm Active
              </h2>
              <p className="text-xs font-semibold text-white/90">
                {items.length} {items.length === 1 ? "item requires" : "items require"} immediate restocking
              </p>
            </div>
          </div>
          <span className="shrink-0 flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider">
            {sounding ? (
              <>
                <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Alarm Sounding
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" /> Silenced
              </>
            )}
          </span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-[#3F3F46]">
            {sounding
              ? "The audible alarm and visual alert will sound until acknowledged."
              : "These items are still at or below their alert limit."}
          </p>

          <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-0.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-3"
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-[#FCA5A5] flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-[#DC2626]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#18181B] leading-snug break-words">
                    {item.name}
                  </div>
                  {item.category && (
                    <div className="text-[11px] text-[#71717A] truncate">{item.category}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      item.stock <= 0
                        ? "bg-[#DC2626] text-white"
                        : "bg-[#FEF3C7] text-[#B45309]"
                    }`}
                  >
                    {item.stock} in stock
                  </span>
                  <span className="text-[10px] text-[#71717A]">Alert limit: {item.alertAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-4">
          <p className="text-[10px] text-[#71717A] leading-snug">
            Silences sound until next new low-stock item.
          </p>
          <button
            type="button"
            autoFocus
            onClick={onAcknowledge}
            className="shrink-0 flex items-center gap-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-xl px-4 py-3 text-xs font-black shadow-md transition-colors cursor-pointer"
          >
            <VolumeX className="w-4 h-4" />
            {sounding ? "Silence Alarm & Acknowledge" : "Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}
