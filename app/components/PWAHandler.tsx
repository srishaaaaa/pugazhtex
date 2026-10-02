"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Check, Smartphone } from "lucide-react";

export default function PWAHandler({
  shopName,
  logo,
}: {
  shopName?: string;
  logo?: string;
}) {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Service worker registration
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("PWA ServiceWorker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.error("PWA ServiceWorker registration failed:", err);
          });
      });
    }

    // Check if app is already running in standalone/PWA mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
    }

    // Listen for PWA installation prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    // Check if the user is authorized (logged in to the dashboard)
    const checkAuth = () => {
      const auth = typeof window !== "undefined" ? (sessionStorage.getItem("pos_authorized") || localStorage.getItem("pos_authorized")) : null;
      setIsAuthorized(auth === "true");
    };

    checkAuth();
    
    // Poll for changes in auth state so the prompt disappears immediately upon login
    const interval = setInterval(checkAuth, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Hide on invoice pages, if already installed/not installable, or if user is authorized (in dashboard)
  if (isInstalled || !isInstallable || pathname?.startsWith("/invoice") || isAuthorized) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-50 bg-[#000000] text-white p-2.5 sm:p-4 rounded-2xl shadow-2xl border-2 border-[var(--accent)] flex items-center gap-2.5 sm:gap-3 animate-in slide-in-from-bottom-5 duration-300 w-auto sm:max-w-[360px] print:hidden">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)] flex items-center justify-center shrink-0 overflow-hidden">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[11px] sm:text-xs font-black tracking-tight text-white uppercase truncate">
          Install {shopName || "Sri Sakthi Pugazh Tex"}
        </h4>
        <p className="text-[9px] sm:text-[10px] text-gray-300 font-semibold truncate">
          Add app for fast offline access
        </p>
      </div>
      <button
        onClick={handleInstallClick}
        className="bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1 shrink-0"
      >
        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        Install
      </button>
    </div>
  );
}
