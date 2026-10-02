import type { ShopSettings } from './types';

/**
 * Accent colour helpers.
 *
 * The shop picks one accent colour in Settings and it is pushed to the browser
 * as `--accent` (see app/layout.tsx). Everything else in the app — POS chrome,
 * storefront, invoices, receipts, PWA banner — reads that variable, so a single
 * change repaints the whole product.
 *
 * This module is free of any database import so it can be used from both
 * server and client components.
 */

/** Fallback used when the shop has never chosen a colour. */
export const DEFAULT_ACCENT = '#31042F';

/** Preset swatches offered in Settings. */
export const ACCENT_PRESETS: string[] = [
  '#31042F', '#7C1D3A', '#9F1239', '#B91C1C', '#C2410C',
  '#A16207', '#15803D', '#047857', '#0F766E', '#0E7490',
  '#1D4ED8', '#4338CA', '#6D28D9', '#7E22CE', '#A21CAF',
  '#9333EA', '#C026D3', '#BE185D', '#475569', '#1C1917',
];

/** Normalise user input to `#RRGGBB`, or return null when unusable. */
export function normalizeHex(input: string): string | null {
  const raw = (input || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
}

/** Parse `#RRGGBB` into 0-255 channels. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * Relative luminance (WCAG). Used to decide whether text sitting on the accent
 * should be white or near-black, so light accents stay readable.
 */
export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.45;
}

/**
 * Build the full set of CSS custom properties derived from one accent colour.
 * Returned as an inline `style` object so it can be spread onto <html>.
 */
export function accentCssVars(accent: string): Record<string, string> {
  const hex = normalizeHex(accent) || DEFAULT_ACCENT;
  return {
    '--accent': hex,
    // Hover / pressed state: mix toward black.
    '--accent-strong': `color-mix(in srgb, ${hex} 82%, #000000)`,
    // Softer tint for borders, chips and hover fills.
    '--accent-soft': `color-mix(in srgb, ${hex} 22%, #FFFFFF)`,
    '--accent-softer': `color-mix(in srgb, ${hex} 10%, #FFFFFF)`,
    // Translucent wash for highlights behind text.
    '--accent-wash': `color-mix(in srgb, ${hex} 12%, #FFFFFF)`,
    // Readable text colour on top of a solid accent fill.
    '--accent-on': isLightColor(hex) ? '#1C1917' : '#FFFFFF',
  };
}

/**
 * Default shop profile. These values are seeded into the database on first run
 * and used as a fallback whenever the database is unreachable.
 *
 * This module is intentionally free of any database import so it can also be
 * used from client components.
 */
export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  owner_name: 'Ananthi M',
  shop_name: 'Dhanyas Boutique',
  tagline: 'Designer Wear • Tailoring • Alterations • Embroidery',
  phone: '8098089591',
  email: 'dhanyasboutique2015@gmail.com',
  address: 'Kasthoribhai road, AGM Apartment, Kumbakonam - 612001',
  location: 'Kumbakonam, Tamil Nadu',
  instagram_url: 'https://www.instagram.com/srisakthipugazhtex',
  business_hours: 'Open Daily',
  services:
    'Custom Tailoring • Designer Blouses & Dresses • Alterations & Fittings • Embroidery & Aari Work • Boutique Wear',
  gstin: '',
  accent_color: DEFAULT_ACCENT,
  logo_data_url: null,
};

/**
 * Instagram link -> display handle.
 * Drops the protocol, `www.`, the profile path AND any query string so a shared
 * link like `.../srisakthipugazhtex?stkn=...` renders as `@srisakthipugazhtex`.
 */
export const instagramHandle = (url: string): string => {
  const raw = (url || '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split(/[?#]/)[0];
  const handle = withoutQuery.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
  return handle ? `@${handle}` : raw;
};

/** Logo src to render: uploaded logo when present, otherwise the bundled asset. */
export const shopLogoSrc = (settings: ShopSettings): string =>
  settings.logo_data_url || '/logo.svg';

/** Phone split for invoice headers, e.g. 8098089591 -> +91 80980 89591 */
export const formatPhone = (phone: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return phone || '';
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
};
