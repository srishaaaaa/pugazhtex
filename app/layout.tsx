import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import PWAHandler from "./components/PWAHandler";
import { getShopSettings, shopLogoSrc, accentCssVars, normalizeHex, DEFAULT_ACCENT } from "@/lib/shopSettings";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export async function generateViewport(): Promise<Viewport> {
  const shop = await getShopSettings();
  return {
    themeColor: normalizeHex(shop.accent_color) || DEFAULT_ACCENT,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };
}

// Shop profile drives the installed-app name and icon.
export async function generateMetadata(): Promise<Metadata> {
  const shop = await getShopSettings();
  const logo = shopLogoSrc(shop);

  return {
    title: `${shop.shop_name} - POS`,
    description: `${shop.shop_name} Billing, Inventory & Digital Invoices`,
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: shop.shop_name,
    },
    icons: {
      icon: logo,
      apple: logo,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shop = await getShopSettings();
  const logo = shopLogoSrc(shop);

  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
      style={accentCssVars(shop.accent_color) as React.CSSProperties}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={shop.shop_name} />
        <link rel="apple-touch-icon" href={logo} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <PWAHandler shopName={shop.shop_name} logo={logo} />
      </body>
    </html>
  );
}
