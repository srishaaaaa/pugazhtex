import { getShopSettings, shopLogoSrc, normalizeHex, DEFAULT_ACCENT } from "@/lib/shopSettings";

export const dynamic = "force-dynamic";

/**
 * Web app manifest generated from the shop profile, so the installed PWA name
 * and icon follow whatever is saved in Settings.
 */
export async function GET() {
  const shop = await getShopSettings();
  const icon = shopLogoSrc(shop);
  const iconType = icon.startsWith("data:")
    ? icon.slice(5, icon.indexOf(";"))
    : icon.endsWith(".svg")
      ? "image/png"
      : icon.endsWith(".png")
        ? "image/png"
        : "image/jpeg";

  const manifest = {
    name: `${shop.shop_name} - POS`,
    short_name: shop.shop_name,
    description: `${shop.shop_name} Point of Sale, Billing & Inventory Management`,
    start_url: "/pos",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: normalizeHex(shop.accent_color) || DEFAULT_ACCENT,
    orientation: "any",
    scope: "/",
    icons: [
      { src: icon, sizes: "any", type: iconType, purpose: "any" },
      { src: icon, sizes: "512x512", type: iconType, purpose: "maskable" },
    ],
  };

  // Fall back to the bundled logo when an uploaded (data URL) icon is rejected.
  if (shop.logo_data_url) {
    manifest.icons.push({
      src: "/logo.png",
      sizes: "any",
      type: "image/png",
      purpose: "any",
    });
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
