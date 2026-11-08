# Feature implementation

The requirements in `feature.md` are adapted to an Apple electronics store. Storage, finish, and case options replace garment sizes in customer-facing flows; admin presets remain available for other categories.

| Area | Implementation |
| --- | --- |
| Discovery | Predictive search, category pages, search/price/configuration/tag filters, price/newest/best-seller sorting |
| Merchandising | Editable promotional carousel, homepage categories, featured/new-arrival/best-seller collection selector |
| Product | Image gallery, configuration pricing and stock, quantity boundaries, quick view, configuration guide, WhatsApp, buy now |
| Wishlist and bag | Guest local storage, account wishlist synchronization, configuration-specific cart lines, editable drawer |
| Discounts | Server-validated coupon normalization, expiry, usage limits, minimum spend, percentage cap, fixed amounts |
| Checkout | Guest COD, saved addresses, regional delivery fees, optional free-delivery threshold, authoritative prices, inventory reservation |
| Orders and invoices | Sequential numbers, private guest confirmation links, immutable invoice snapshots, print/PDF, fulfillment timeline |
| Customer accounts | Password sign-in, dashboard, order history, saved addresses, profile, wishlist |
| Admin | Protected roles, KPIs, orders, products and image upload, categories, banners, stock adjustment and audit, customers, coupons, settings, staff |
| Fulfillment | Forward progression, pre-dispatch cancellation, stock release, guarded reopening, return/refund handling, payment states, audit notes |
| Support | Authenticated Socket.IO rooms, live replies, typing, presence, unread indicators, support console, quick replies, customer context; HTTP fallback on serverless hosts |
| Storage | SQLite tables for users, roles/permissions, categories, products/variants/images, orders/items/timeline, invoices, addresses, wishlists, coupons, inventory logs, conversations/messages, settings, sessions, subscribers, banners, notifications |

Implementation choices:

- Passwords use salted Node scrypt and constant-time comparison instead of bcrypt.
- SQLite transactions commit order, stock, invoice, and notification changes together. A revision guard rejects stale writes; database constraints reject negative stock. Product metadata and invoice snapshots use JSON columns inside relational tables.
- Existing `data/store.json` is imported once when the SQLite database is empty. It is left intact as a migration source. Customized images and banners are preserved.
- No email/SMS sending, online payment gateway, or courier integration is configured. Newsletter signup stores addresses only.
- Prices, configurations, stock, and contact information are demonstration data until replaced in admin.
- The current repository reads the store into memory and commits its state as one transaction. It targets a single persistent Node host. Large catalogs, high write volume, and multiple application nodes require a query-oriented repository and a shared production database; this is not a claim of enterprise scale.
- Vercel's temporary filesystem is unsuitable for durable customer data. Socket.IO runs on the persistent Node server; the Vercel mode uses polling.

Validation: `npm test` checks rendering, pricing, inventory, coupons, order privacy, status transitions, realtime authorization, migration, persistence, and transaction rollback. `npm run test:browser` checks shopping, mobile checkout, reduced motion, and keyboard dialog behavior in Chromium using an isolated temporary database.
