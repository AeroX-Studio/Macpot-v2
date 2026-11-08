# MacPoint

An Apple-focused storefront built with Express, EJS, SQLite, and Socket.IO. The interface uses warm neutral colors, Manrope typography, responsive editorial layouts, scroll entrances, interactive product collections, and reduced-motion support.

## Run locally

Requires Node.js **22.13 or newer**. Node 24 LTS is recommended.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Use `npm start` for a normal server process. `PORT` changes the listening port.

Sign in at **`/admin/login`** with your administrator email and password. Successful sign-in opens `/admin`, or returns you to the admin page you originally requested. Administrators signing in through `/login` also reach the dashboard. Customer accounts cannot sign in to the admin area.

For a new store only, visit `/admin/setup` to create the first Super Admin with a password of at least 12 characters. Setup closes once an administrator exists; there are no default credentials. Sign out from the dashboard to revoke your session. Super Admins can add staff and assign roles under **Admin access**. Store contact details, delivery charges, products, variants, banners, and coupons are managed in `/admin`.

## Included

- Predictive search, product/category pages, filters, sorting, quick view and configuration selection.
- Mobile bottom navigation, a category menu, collapsible shop filters, touch-sized controls, responsive checkout and admin navigation, and reduced-motion-aware entrance animations.
- Persistent shopping bag, guest/account wishlists, coupons, regional delivery charges and COD checkout.
- Server-side price validation, transactional stock reservations, guarded cancellation/reopening/returns, invoices and protected order tracking.
- Customer accounts, address book, profile and order history.
- Role-based admin dashboard, catalog, uploads, fulfillment, inventory audit, customers, coupons, banners, settings and staff.
- Live support with private Socket.IO rooms, typing, presence, unread indicators, and the admin support console.

See [FEATURE-STATUS.md](FEATURE-STATUS.md) for coverage of the supplied specification and implementation boundaries.

## Data and deployment

SQLite data is stored in `data/store.sqlite`. Set `MACPOINT_DATABASE_FILE` to a database path on a persistent local disk. Database files, WAL files, sessions, and runtime customer data are ignored by Git.

On the first run with an empty database, an existing `data/store.json` is imported automatically and preserved. `MACPOINT_DATA_FILE` selects an alternate legacy JSON source; unless a database path is provided, the SQLite file is placed beside it. Future writes go to SQLite, not the old JSON file. Back up the database using a SQLite-aware backup while running, or stop the app before copying the database and WAL files together.

Use a persistent Node server for durable data and Socket.IO. The repository's Vercel mode uses `/tmp` and HTTP chat polling, so it is for previews only. Production on Vercel requires a durable external database and a compatible realtime service. A high-volume deployment also needs a query-oriented repository instead of the current full-store transactions.

Catalog prices, stock, configurations, and contact details are sample values. Replace them with your actual inventory and approved images before taking real orders. Newsletter signup stores addresses; email/SMS delivery, online payments, and courier integrations are not configured.

## Checks

```powershell
npm test
npx playwright install chromium
npm run test:browser
```

Tests use isolated temporary SQLite databases and never modify the working store. Browser tests cover search, collection filters, quick view, wishlist, cart persistence, mobile COD checkout, layouts from 320px wide, first-time admin setup, sign-in errors, protected destinations, mobile admin navigation, reduced motion, and keyboard dialogs. Integration tests cover pricing, coupons, inventory and order transitions, role permissions, sign-in redirects, session revocation, live chat, database rollback, persistence and migration.

## Main files

| File | Purpose |
| --- | --- |
| `server.js` | Pages, commerce APIs and admin routes |
| `data/database.js` | Relational SQLite persistence and transactions |
| `data/store.js` | Seed data, migration and store access |
| `data/presentation.js` | Default imagery and editable promotional slides |
| `data/roles.js` | Admin role permissions |
| `lib/realtime.js` | Authenticated chat rooms and live events |
| `views/index.ejs` | Editorial homepage |
| `public/css/premium.css` | Shared design and responsive layouts |
| `public/css/mobile.css` | Mobile storefront, admin and sign-in layouts |
| `public/js/auth.js` | Password visibility, confirmation and sign-in feedback |
| `public/js/app.js` | Shopping, search and customer chat |
| `public/js/storefront.js` | Collection filtering and hero navigation |
| `public/images/SOURCES.md` | Image provenance |

`GET /healthz` returns a JSON health response.
