# SRI SAKTHI PUGAZH TEX — POS & Inventory Billing System

A PWA-enabled Point of Sale (POS), billing, and inventory management system for **Sri Sakthi Pugazh Tex**, Kumbakonam. It handles quick invoice generation, WhatsApp delivery of digital receipts, order history, GST / non-GST billing with two revenue dashboards, stock management with low-stock alerts, and an editable shop profile.

## Features

### 🎨 Appearance (Admin only)
- **20 preset swatches** plus a native colour picker and a hex field (`#RRGGBB`) for any custom shade
- **Live preview** — the whole POS repaints as you pick, before you save
- **One colour drives the entire app**: POS chrome, storefront, invoices, advance receipts, scrollbars, text selection, scrollbar, PWA install banner and the browser/mobile theme colour
- Derived shades (`--accent-strong`, `--accent-soft`, `--accent-wash`) are computed automatically, so hover states and tints stay readable on light *and* dark accents
- Text placed on the accent automatically flips white or near-black based on WCAG contrast, so pale colours never produce unreadable buttons
- Printed invoices keep the brand colour via `print-color-adjust: exact`
- Stored in `shop_settings.accent_color`; the column is added automatically to existing databases

### ⚙️ Shop Settings (Admin only)
- Edit the shop profile used everywhere: owner name, shop name, tagline, phone, email, address, city, business hours, Instagram link and GSTIN
- Upload or reset the **shop logo** (auto-resized to 512px and stored with the profile)
- Edit the **product catalogue** inline — add, rename, re-price, change GST % / HSN, delete items
- Create catalogue categories without leaving the screen
- Changes flow straight to the public store page (`/`), printed invoices/receipts, the PWA manifest and app icon
- The `shop_settings` table is created automatically on first run — no manual migration needed

### 🧾 POS Billing Panel
- Quick invoice generator with a searchable product catalog
- Add custom items with price and quantity controls
- Manual discounts (fixed ₹ or percent %)
- **GST Invoice / Non-GST Bill toggle** at the point of billing
- **Changeable GST %** — pre-filled from each product's default GST rate, editable per sale
- Optional delivery fee
- Cash payment tracking with auto-calculated change return
- Backdate support (custom / past bill dates)
- Online / Offline (POS) order source toggle
- Send the bill directly to the customer via WhatsApp with a digital invoice link

### 📦 Inventory (Admin only)
- Full CRUD on the catalogue — **products and services** in one list
- **Product ⇄ Service switch** at the top of the item form. Services (delivery, packing, add-ons, alteration charges) support price, cost, GST, HSN, offers and notes but carry **no stock**
- Per-item **cost price** (records only, never used in billing) and **Active** flag (inactive items are hidden from the Billing Panel)
- **Stock tracking** on products with a **low-stock alert** that flags the row in red
- Stock is **decremented automatically** when a bill is completed; services are skipped
- **Automatic offers** — set an offer % and price once, and it is applied automatically whenever the item is added to a bill and shown on the invoice
- Per-product **GST rate** (used to pre-fill GST at billing) and **HSN code**
- Export the complete catalogue to CSV (type, cost, stock, low-stock alert, offer and active status included)

### 📜 Order History
- Search orders by ID, customer name, or phone number
- Filter by source (Online / Offline) and status
- Period filters (All Time, Today, Week, Month, Year, Custom range)
- View detailed order modal
- Print / download invoice as PDF
- Resend invoice via WhatsApp
- Export filtered orders to CSV (admin only)
- Delete invoices (admin only)

### 📊 Analytics — GST & Non-GST Dashboards (Admin only)
- Switch the whole dashboard between **All Bills / GST Invoices / Non-GST Bills**
- KPIs: total revenue, completed bills, online/offline split, items sold, avg order value
- Today's Sales, monthly & weekly revenue trends
- Product sales leaderboard with market share
- Coupon / promo campaign performance tracking
- Custom period filters and contact/invoice search

### 📱 PWA & Mobile
- Installable as a standalone app
- Offline-first service worker with network-first caching
- Responsive mobile-friendly UI

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- lucide-react (icons)

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in real values:

```env
ADMIN_PASSCODE=your-admin-passcode
STAFF_PASSCODE=your-staff-passcode
DATABASE_URL=postgresql://user:password@hostname/dbname?sslmode=require
```

> **Note:** if `ADMIN_PASSCODE` / `STAFF_PASSCODE` are unset the POS falls back to
> `admin123` (admin) and `staff123` (staff). Set both env vars before going live.

### 3. Set up the database

Run `schema.sql` once in your Neon SQL Editor (or `psql`) to create a clean, empty database. The `shop_settings` table is also auto-created on first run.

### 4. Run the Development Server

```bash
npm run dev
```

Open http://localhost:3000.

- Public store page: `/`
- POS terminal: `/pos`
- Digital invoice: `/invoice/[invoice-id]`

## Deploying to Vercel

1. **Rotate the Neon password first.** The database role password must be treated as
   secret — generate a new one in the Neon console (Connect → Reset password) and copy
   the new pooled connection string.

2. **Import the repository** at Vercel (`srishaaaaa/dhaaanyaaaa`). Framework preset:
   Next.js. Build command and output are detected automatically.

3. **Add environment variables** under Project → Settings → Environment Variables,
   for **Production**, **Preview** and **Development**:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** connection string (the `-pooler` host, port `6543`) |
   | `ADMIN_PASSCODE` | Long random admin passcode |
   | `STAFF_PASSCODE` | Long random staff passcode |

   These are read server-side only. Nothing secret is exposed to the browser bundle.

4. **Deploy.** Pushing to `main` triggers a production deployment.

5. **Post-deploy checks**
   - POS login accepts the new passcodes (and *only* those).
   - A **product** sale decrements stock.
   - A **service** sale leaves stock untouched.
   - Automatic offers apply on cart and invoices.
   - WhatsApp invoice links resolve.
   - Shop Settings changes (name, logo, categories) appear on `/`, invoices and the manifest.

> Keep the repo private and never commit `.env.local`. `.env.example` is the only
> env file that belongs in git.

## Data Model

- **shop_settings** — single row (`id = 'default'`) holding the shop profile: owner name, shop name, tagline, phone, email, address, city, business hours, Instagram link, GSTIN, the uploaded logo (stored as a data URL) and `accent_color` (the app-wide theme colour).
- **products** — the catalogue. Rows are either `PRODUCT` (physical, stock-tracked) or `SERVICE` (non-stocked add-ons). Each row carries `selling_price`, `cost_price`, `gst_rate`, `hsn_code`, `current_stock` / `low_stock_alert` (NULL for services), `offer_discount_pct` / `offer_price` and `is_active`.
- **order_items** — invoice lines, snapshotting name, price, quantity and the `offer_pct` that was applied.
- **customers**, **orders**, **order_items** — sales records. `orders.is_gst` flags GST invoices vs non-GST bills, which powers the two revenue dashboards.

See `schema.sql` for the full schema.

## Roles

- **Staff** — Billing Panel, Order History (view-only).
- **Admin** — Full access, including Inventory CRUD, Shop Settings, Analytics, and delete permissions.

The role is determined by which passcode is used to log in.

## License

© 2026 Sri Sakthi Pugazh Tex. All Rights Reserved.

Powered by [Cenexa Systems](https://www.cenexasystems.com/).
