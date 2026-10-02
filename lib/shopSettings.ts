import { sql } from './db';
import type { ShopSettings } from './types';
import { DEFAULT_SHOP_SETTINGS, DEFAULT_ACCENT, normalizeHex } from './shopProfile';

// Re-exported so server modules can pull everything shop-related from one file.
export { DEFAULT_SHOP_SETTINGS, shopLogoSrc, formatPhone, instagramHandle, DEFAULT_ACCENT, ACCENT_PRESETS, accentCssVars, isLightColor, normalizeHex } from './shopProfile';

/** Single-row key so the profile is a singleton. */
const SETTINGS_ID = 'default';

let schemaChecked = false;

/** Create the shop_settings table on first use so no manual migration is needed. */
async function ensureSchema(): Promise<void> {
  if (schemaChecked) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS shop_settings (
        id TEXT PRIMARY KEY,
        owner_name TEXT NOT NULL DEFAULT '',
        shop_name TEXT NOT NULL DEFAULT '',
        tagline TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        instagram_url TEXT NOT NULL DEFAULT '',
        business_hours TEXT NOT NULL DEFAULT '',
        services TEXT NOT NULL DEFAULT '',
        gstin TEXT NOT NULL DEFAULT '',
        logo_data_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    // Idempotent migration for databases created before theming existed.
    await sql`ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#31042F'`;
    schemaChecked = true;
  } catch (err) {
    console.error('Failed to ensure shop_settings table:', err);
  }
}

const toSettings = (row: Record<string, unknown>): ShopSettings => ({
  owner_name: (row.owner_name as string) || DEFAULT_SHOP_SETTINGS.owner_name,
  shop_name: (row.shop_name as string) || DEFAULT_SHOP_SETTINGS.shop_name,
  tagline: (row.tagline as string) || DEFAULT_SHOP_SETTINGS.tagline,
  phone: (row.phone as string) || DEFAULT_SHOP_SETTINGS.phone,
  email: (row.email as string) || DEFAULT_SHOP_SETTINGS.email,
  address: (row.address as string) || DEFAULT_SHOP_SETTINGS.address,
  location: (row.location as string) || DEFAULT_SHOP_SETTINGS.location,
  instagram_url: (row.instagram_url as string) || DEFAULT_SHOP_SETTINGS.instagram_url,
  business_hours: (row.business_hours as string) || DEFAULT_SHOP_SETTINGS.business_hours,
  services: (row.services as string) || DEFAULT_SHOP_SETTINGS.services,
  gstin: (row.gstin as string) || DEFAULT_SHOP_SETTINGS.gstin,
  accent_color: normalizeHex((row.accent_color as string) || '') || DEFAULT_SHOP_SETTINGS.accent_color,
  logo_data_url: (row.logo_data_url as string) || null,
  updated_at: row.updated_at ? String(row.updated_at) : undefined,
});

/** Read the shop profile, seeding defaults on first run. Never throws. */
export async function getShopSettings(): Promise<ShopSettings> {
  try {
    await ensureSchema();
    const rows = (await sql`SELECT * FROM shop_settings WHERE id = ${SETTINGS_ID}`) as Record<
      string,
      unknown
    >[];

    if (!rows || rows.length === 0) {
      const seeded = (await sql`
        INSERT INTO shop_settings (id, owner_name, shop_name, tagline, phone, email, address, location, instagram_url, business_hours, services, gstin, logo_data_url, accent_color)
        VALUES (
          ${SETTINGS_ID}, ${DEFAULT_SHOP_SETTINGS.owner_name}, ${DEFAULT_SHOP_SETTINGS.shop_name},
          ${DEFAULT_SHOP_SETTINGS.tagline}, ${DEFAULT_SHOP_SETTINGS.phone}, ${DEFAULT_SHOP_SETTINGS.email},
          ${DEFAULT_SHOP_SETTINGS.address}, ${DEFAULT_SHOP_SETTINGS.location}, ${DEFAULT_SHOP_SETTINGS.instagram_url},
          ${DEFAULT_SHOP_SETTINGS.business_hours}, ${DEFAULT_SHOP_SETTINGS.services}, ${DEFAULT_SHOP_SETTINGS.gstin},
          ${DEFAULT_SHOP_SETTINGS.logo_data_url}, ${DEFAULT_ACCENT}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `) as Record<string, unknown>[];
      return toSettings(seeded[0]);
    }

    return toSettings(rows[0]);
  } catch (err) {
    console.error('Failed to load shop settings:', err);
    return DEFAULT_SHOP_SETTINGS;
  }
}

/** Upsert the shop profile. */
export async function saveShopSettings(input: ShopSettings): Promise<ShopSettings> {
  await ensureSchema();
  const rows = (await sql`
    INSERT INTO shop_settings (
      id, owner_name, shop_name, tagline, phone, email, address, location,
      instagram_url, business_hours, services, gstin, logo_data_url, updated_at, accent_color
    )
    VALUES (
      ${SETTINGS_ID}, ${input.owner_name}, ${input.shop_name}, ${input.tagline},
      ${input.phone}, ${input.email}, ${input.address}, ${input.location},
      ${input.instagram_url}, ${input.business_hours}, ${input.services}, ${input.gstin},
      ${input.logo_data_url}, now(), ${input.accent_color}
    )
    ON CONFLICT (id) DO UPDATE SET
      owner_name = EXCLUDED.owner_name,
      shop_name = EXCLUDED.shop_name,
      tagline = EXCLUDED.tagline,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      location = EXCLUDED.location,
      instagram_url = EXCLUDED.instagram_url,
      business_hours = EXCLUDED.business_hours,
      services = EXCLUDED.services,
      gstin = EXCLUDED.gstin,
      logo_data_url = EXCLUDED.logo_data_url,
      accent_color = EXCLUDED.accent_color,
      updated_at = now()
    RETURNING *
  `) as Record<string, unknown>[];

  return toSettings(rows[0]);
}
