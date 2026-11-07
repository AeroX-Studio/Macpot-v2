# Complete Feature & Functional Architecture Specification

This document provides a comprehensive, implementation-focused functional specification of all **E-Commerce Storefront Features** and **Admin Panel Back-Office Features**. 

> **Scope Note:** This document focuses exclusively on **features, workflows, business logic, algorithms, state machines, and data models** (no design/CSS/styling details) so you can implement all of these capabilities into another website.

---

## 1. System Architecture & Role Model

```
                    ┌─────────────────────────┐
                    │      GUEST USER         │
                    │  (Browses, Chats, Buys) │
                    └────────────┬────────────┘
                                 │ Places Order / Registers
                                 ▼
                    ┌─────────────────────────┐
                    │     CUSTOMER USER       │
                    │ (Orders, History, Acct) │
                    └─────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   ADMINISTRATOR (RBAC)  │
                    │  (Fulfillment, Catalog) │
                    └─────────────────────────┘
```

The system operates on three user tiers:
1. **Guest User:** Can browse catalog, use live predictive search, filter products, open size charts, toggle wishlist, add items to cart, use live chat (by providing name and phone), and complete Cash on Delivery checkout without prior registration.
2. **Customer User:** Has a registered account (authenticated via Email or Mobile Phone + Password). Has access to an order history portal, live fulfillment status stepper, downloadable invoices, saved delivery address book, and profile settings.
3. **Administrator:** Has an administrative role with Role-Based Access Control (RBAC) permissions or `Super Admin` privileges. Has access to the protected `/admin` control center.

---

## 2. Storefront (E-Commerce) Features & How They Work

### 2.1. Product Discovery, Catalog & Search

#### 2.1.1. Instant Predictive Live Search
- **How It Works:**
  - A search input in the header listens for user typing.
  - When the search query reaches $\ge 2$ characters, a debounced timer (150ms) sends an asynchronous request to `/api/products/search?q={query}`.
  - The API performs a SQL query matching against `name`, `description`, `sku`, and `tags` using wildcard patterns (`%query%`).
  - Returns up to 6 matching active products with their primary image thumbnail, product title, category name, regular price, and sale price.
  - Clicking a result navigates directly to `/product/{slug}`; pressing `Enter` submits the form and navigates to the full shop search page `/shop?q={query}`.

#### 2.1.2. Faceted Catalog Filtering (`/shop`)
- **How It Works:**
  - Server-side query builder dynamically constructs SQL queries based on URL query parameters:
    - `q`: Free-text search on title, description, SKU, and tags.
    - `category`: Matches against `categories.slug`.
    - `size`: Joins `product_variants` and filters by `size_name` (e.g. `S`, `M`, `L`, `XL`, `40`, `42`).
    - `minPrice` & `maxPrice`: Evaluates active price using `COALESCE(sale_price, price)`.
    - `tag`: Filters by campaign tags (e.g., `festive`, `eid`).
- **Sidebar Category Listing:** Automatically queries only categories marked with `show_in_sidebar = 1` and counts active products per category (`COUNT(products.id)`).

#### 2.1.3. Multi-Criteria Catalog Sorting
- **How It Works:** Evaluates the `sort` query parameter:
  - `newest` (Default): `ORDER BY p.id DESC`.
  - `price_asc`: `ORDER BY COALESCE(p.sale_price, p.price) ASC`.
  - `price_desc`: `ORDER BY COALESCE(p.sale_price, p.price) DESC`.
  - `best_seller`: `ORDER BY p.is_best_seller DESC, p.total_sold DESC`.

#### 2.1.4. Dynamic Category Routing (`/category/[slug]`)
- **How It Works:**
  - Resolves category metadata by unique slug.
  - Retrieves all active products linked to that category ID.
  - Automatically enriches each product object with its primary image and active size variants.

#### 2.1.5. Homepage Merchandising Engine (`/`)
- **How It Works:**
  - **Hero Slider / Banners:** Queries active promotional banners ordered by `sort_order`.
  - **Category Showcase Carousel:** Queries categories flagged with `show_on_homepage = 1`.
  - **Featured Products Grid:** Products with `is_featured = 1`.
  - **New Arrivals Grid:** Products with `is_new_arrival = 1`.
  - **Best Sellers Grid:** Products with `is_best_seller = 1` sorted by `total_sold DESC`.

---

### 2.2. Product Detail, Variants & Sizing

#### 2.2.1. Multi-Image Media Gallery
- **How It Works:**
  - Loads all images associated with the product from `product_images` ordered by `sort_order ASC`.
  - Sets the primary image (`is_primary = 1`) as the default active display.
  - Clicking any thumbnail dynamically switches the main view to the high-resolution image without page reload.

#### 2.2.2. Size Variant & Dynamic Price Matrix
- **How It Works:**
  - Fashion apparel often requires varying sizes (e.g., Free Size, Standard S–XXL, or Numeric 38–52) with potential price differences.
  - The page loads `product_variants` where `is_active = 1`.
  - Selecting a size button updates the component state:
    - **Current Price:** Checks if the selected variant has a custom price (`variant.price`); if not, falls back to `product.sale_price || product.price`.
    - **Current Stock:** Tracks stock per variant (`variant.stock`).
    - **Stock Status:** If variant stock is 0, the size option displays an "Out of Stock" indicator and disables the "Add to Cart" button.

#### 2.2.3. Quantity Boundary Controller
- **How It Works:**
  - Allows the customer to select desired quantities using `+` and `−` controls.
  - **Minimum Constraint:** Cannot be reduced below 1.
  - **Maximum Constraint:** Capped at the available stock of the chosen variant or total product stock.

#### 2.2.4. Interactive Quick View Modal
- **How It Works:**
  - Available on product listing cards across the storefront.
  - Clicking "Quick View" loads the product data into a global UI context (`QuickViewModal`).
  - Renders image, pricing, size selector, quantity adjuster, and an instant "Add to Cart" action without forcing the user to leave their current browsing position.

#### 2.2.5. Size Measurement Guide Modal
- **How It Works:**
  - A "Size Guide" button on product pages triggers the `SizeChartModal`.
  - Displays standard body measurements:
    - Standard Size (`S`, `M`, `L`, `XL`, `XXL`, `3XL`, `4XL`)
    - Numeric Chest Size (`36`, `38`, `40`, `42`, `44`, `46`, `48`)
    - Bust, Waist, Hip, and Length measurements in inches.
  - Can be customized per product category (e.g., Three-Piece vs. Kurti vs. Saree).

#### 2.2.6. Direct "Order via WhatsApp" Integration
- **How It Works:**
  - Provides instant conversion for shoppers who prefer communicating on WhatsApp.
  - Reads active product details: name, chosen size variant, and SKU.
  - Generates a pre-encoded deep link:
    ```
    https://wa.me/{STORE_WHATSAPP}?text=Hi! I want to order "{name}" in size {size} (SKU: {sku}). Is it available?
    ```
  - Clicking opens WhatsApp on mobile or WhatsApp Web on desktop with the message pre-filled.

#### 2.2.7. "Buy Now" Instant Checkout Flow
- **How It Works:**
  - Bypasses the shopping cart drawer.
  - Adds the selected product, size, and quantity to the cart state and executes an immediate client-side redirect (`router.push('/checkout')`).

#### 2.2.8. Customer Wishlist Engine
- **How It Works:**
  - Managed by `WishlistContext` with dual-mode persistence:
    - **Guest Mode:** Stored in browser `localStorage`.
    - **Authenticated Mode:** Synced to the `wishlists` database table (`user_id`, `product_id`).
  - Clicking the heart icon on any card or detail page toggles the product's saved state.
  - Real-time wishlist count badge displays in the header.
  - Dedicated wishlist drawer and account page allow one-click transfer of saved items into the active cart.

---

### 2.3. Shopping Cart & Discount Engine

#### 2.3.1. Composite Key Cart State Management
- **How It Works:**
  - Items in the cart are identified by a composite key:
    ```javascript
    const itemKey = `${product.id}-${sizeName}-${colorName || ''}`;
    ```
  - Allows a customer to add the exact same dress in different sizes (e.g., one in size `38` and one in size `42`) as distinct cart items without collision.
  - Automatically increments quantity if the exact composite key is added again.

#### 2.3.2. Cart Persistence & Slide-Over Drawer
- **How It Works:**
  - Stored in browser `localStorage` (`nobo_cart_v1`) to persist items across page reloads and browser sessions.
  - Real-time item count badge in the header updates reactively.
  - Slide-over `CartDrawer` provides quick inline quantity increment, decrement, and item removal.

#### 2.3.3. Promotional Coupon Validation Engine (`/api/coupons/validate`)
- **How It Works:**
  - Customer enters a promo code in the cart or checkout.
  - Sent to `/api/coupons/validate` along with the current cart subtotal.
  - **Validation Rules Executed:**
    1. **Case Normalization:** Trims whitespace and converts to uppercase (e.g., `eid2026` $\rightarrow$ `EID2026`).
    2. **Active & Expiration Check:** Must be `is_active = 1` and `(expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`.
    3. **Usage Limit Check:** If `usage_limit` is set, verifies that `used_count < usage_limit`.
    4. **Minimum Order Check:** Validates that `subtotal >= min_order_amount`.
  - **Discount Calculation:**
    - **Percentage Discount:** `discount = (subtotal * discount_value) / 100`. If `max_discount` is configured, applies ceiling: `discount = Math.min(discount, max_discount)`.
    - **Fixed Discount:** `discount = discount_value`.
  - Upon successful validation, stores coupon details in state and `localStorage` to reflect the deducted total.

#### 2.3.4. Dynamic Delivery Fee Calculation
- **How It Works:**
  - Supports regional delivery fee structures:
    - **Inside Dhaka:** Flat rate (e.g., `৳80`).
    - **Outside Dhaka:** Courier rate (e.g., `৳150`).
  - Changing the radio button/selection in the cart or checkout instantly recalculates the delivery charge and updates the grand total:
    $$\text{Grand Total} = \max(0, \text{Subtotal} - \text{Discount} + \text{Delivery Charge})$$

---

### 2.4. Checkout & Order Placement Engine (`/api/orders`)

#### 2.4.1. Single-Page Cash on Delivery (COD) Checkout
- **How It Works:**
  - Designed for high conversion with minimal friction.
  - Collects customer shipping details:
    - Full Name
    - Mobile Phone Number (validated for 11 digits, e.g. `01XXXXXXXXX`)
    - Delivery Address (Street / Area / House)
    - City / District
    - Delivery Zone (`dhaka` or `outside_dhaka`)
    - Optional Delivery Instructions / Notes
  - If a customer is logged in, their profile name, phone, and email are automatically pre-filled into the form fields.

#### 2.4.2. Server-Side Security & Price Anti-Tamper Revalidation
- **How It Works:**
  - Client-side prices submitted in the request body are **never trusted**.
  - The server loops through every item submitted in `items`:
    - Queries the database for the active product record (`SELECT * FROM products WHERE id = ? AND is_active = 1`).
    - Checks the variant table if `variantId` is present.
    - Resolves the true unit price from the database: `variant.price || product.sale_price || product.price`.
    - Re-calculates subtotal and item line totals securely on the server.

#### 2.4.3. Seamless Guest Checkout with Auto-Account Provisioning
- **How It Works:**
  - If the customer is not logged in (`!session?.user?.id`):
    - The server searches the `users` table by phone number: `SELECT id FROM users WHERE phone = ?`.
    - **Existing User Match:** Links the order directly to their existing `user_id`.
    - **New User Creation:** Automatically creates a customer account in the `users` table with `user_type = 'customer'`, `status = 'active'`, and a randomly generated hashed password.
    - This ensures customer lifetime spend and order history are unified under a single phone profile without forcing the customer through a registration wall.

#### 2.4.4. Order Number & Invoice Number Generator
- **How It Works:**
  - Reads current order sequence count.
  - Generates standardized sequential numbers:
    - Order Number: `PC-2026-000142`
    - Invoice Number: `INV-PC-2026-000142`

#### 2.4.5. Real-Time Inventory Deduction & Analytics Rollup
- **How It Works:**
  - As soon as the order is placed:
    - Product stock is reduced: `stock = MAX(0, stock - quantity)`.
    - Variant stock is reduced: `stock = MAX(0, stock - quantity)`.
    - Sales counters are incremented: `total_sold = total_sold + quantity` and `sold_count = sold_count + quantity`.

#### 2.4.6. Automatic Invoice Snapshot Creation
- **How It Works:**
  - In addition to creating the relational `order_items` records, the server creates an entry in the `invoices` table.
  - Stores a complete JSON snapshot (`invoice_data`) containing product names, unit prices, applied coupon, delivery fees, customer contact information, and timestamp.
  - This guarantees that even if a product's price or description changes in the future, past invoices remain historically accurate.

#### 2.4.7. Initial Timeline & Admin Notification Dispatch
- **How It Works:**
  - Inserts the first milestone into `order_timeline`:
    `"Order placed successfully by customer via Cash on Delivery."`
  - Creates a notification entry in the `notifications` table for store administrators:
    `"New Order #PC-2026-000142: Customer Joy placed a COD order of ৳4,280"`.
  - Executes immediate binary database persistence to disk.
  - Returns `orderId` and `orderNumber` to redirect the customer to `/order-success`.

---

### 2.5. Post-Purchase Experience & Customer Account Portal

#### 2.5.1. Visual Order Fulfillment Stepper (`/order-success`)
- **How It Works:**
  - Displays a milestone tracker reflecting the dispatch pipeline:
    1. Order Placed (`pending`)
    2. Phone Confirmed (`confirmed`)
    3. Processing / Sourcing (`processing`)
    4. Packed (`packed`)
    5. Handed to Courier (`shipped`)
    6. Out for Delivery (`out_for_delivery`)
    7. Delivered (`delivered`)
  - Displays order summary, COD payment reminder, and a direct button to print the invoice.

#### 2.5.2. Customer Account Dashboard (`/account`)
- **How It Works:**
  - Authenticated route requiring customer session.
  - Aggregates customer metrics:
    - Total Orders count
    - Lifetime Total Spent (`৳`)
    - Generated Invoices count
  - Displays a table of recent orders with status badges and quick links.

#### 2.5.3. Customer Order Tracking (`/account/orders/[id]`)
- **How It Works:**
  - Displays complete details for a specific order.
  - Visual fulfillment progress tracker.
  - Item breakdown with thumbnails, sizes, and line totals.
  - Full chronological order audit timeline showing status updates and notes added by staff.

#### 2.5.4. Customer Address Book (`/account/addresses`)
- **How It Works:**
  - Displays saved delivery locations (`Home`, `Office`, etc.).
  - Tracks default shipping address (`is_default = 1`).
  - Automatically captures and saves addresses during checkout.

#### 2.5.5. Customer Invoice Printing (`/account/invoices/[id]`)
- **How It Works:**
  - Displays an A4 document layout with store branding, corporate contact information, invoice number, and line item billing details.
  - Features an inline "Print / Save as PDF" action that triggers `window.print()`.
  - Uses CSS print media rules (`@media print`) to hide navigation bars and headers, generating a clean paper invoice.

---

### 2.6. Customer Live Chat Widget

#### 2.6.1. Real-Time WebSocket Customer Messaging
- **How It Works:**
  - A floating widget (`LiveChatWidget`) resides on every storefront page.
  - Connects to the server's Socket.IO endpoint at `/api/socketio`.
  - If the visitor is not logged in, asks for their **Name** and **Mobile Phone Number** on first open and stores them in `localStorage`.
  - Sends messages to `/api/chat/messages` and emits `message:send` via WebSockets.
  - Listens for `message:new` events from the server to append incoming admin replies instantly.
  - Emits `typing:start` and `typing:stop` on keystrokes.
  - Displays an unread badge on the floating bubble when a new reply arrives while the chat panel is minimized.

---

## 3. Admin Panel Features & How They Work

### 3.1. Admin Security & Role-Based Access Control (RBAC)

```
Incoming Request to /admin/*
        │
        ▼
Server Session Check (getServerSession)
        │
        ├─► No Session / userType != 'admin'  ──►  Redirect to /login?callbackUrl=/admin
        │
        ▼
Session Valid & userType == 'admin'
        │
        ▼
RBAC Permission Check (hasPermission)
        │
        ├─► Super Admin: Unrestricted Access (Bypasses all checks)
        └─► Other Roles: Checked against role_permissions (view_orders, edit_products, etc.)
```

- **How It Works:**
  - Every layout and API route under `/admin` enforces server-side validation.
  - Unauthenticated users are redirected to the login page with the return URL preserved in `callbackUrl`.
  - Roles (`Super Admin`, `Manager`, `Order Manager`, `Product Manager`, `Customer Support`, `Inventory Manager`) inherit specific permissions from `permissions` via `role_permissions`.
  - The `Super Admin` role automatically bypasses individual permission gates.

---

### 3.2. Real-Time Admin Dashboard Overview (`/admin`)

- **How It Works:**
  - Executes aggregation queries to calculate business KPIs:
    - **Total COD Revenue:** `SELECT SUM(total) FROM orders WHERE order_status != 'cancelled'`.
    - **Total Orders:** `SELECT COUNT(id) FROM orders` (plus pending count).
    - **Active Catalog:** Count of published items.
    - **Low Stock Alarm:** `SELECT COUNT(id) FROM products WHERE stock <= low_stock_threshold AND is_active = 1`.
    - **Customers:** Count of registered customer accounts.
  - **Recent Orders Feed:** Real-time list of the 8 latest orders with customer details, delivery zone, total, status pill, and direct fulfillment link.
  - **Top Selling Products Leaderboard:** Ranked by `total_sold DESC` with current stock counters.

---

### 3.3. Cash on Delivery (COD) Order Fulfillment Hub (`/admin/orders` & `/admin/orders/[id]`)

#### 3.3.1. Status Filter Tabs with Live Counters
- **How It Works:**
  - Provides quick-filter tabs: `All Orders`, `Pending`, `Confirmed`, `Processing`, `Shipped`, `Delivered`, `Cancelled`.
  - Each tab displays an active counter badge calculated via `COUNT(id)` grouped by `order_status`.
  - Instant multi-field search matches order numbers, customer names, or phone numbers.

#### 3.3.2. Order Status Progression State Machine
- **How It Works:**
  - Allows staff to progress orders through a 10-stage lifecycle:
    1. `pending` (Awaiting initial phone call)
    2. `confirmed` (Customer confirmed address and order details)
    3. `processing` (Item is being tailored/sourced)
    4. `packed` (Parcel packed with invoice)
    5. `shipped` (Handed over to courier service)
    6. `out_for_delivery` (Courier delivery rider dispatched)
    7. `delivered` (Customer received package and paid cash)
    8. `cancelled` (Cancelled before dispatch)
    9. `returned` (Customer refused parcel or courier failed delivery)
    10. `refunded` (Adjusted return)

#### 3.3.3. COD Payment Status Tracker
- **How It Works:**
  - Tracks financial settlement through 5 states:
    `pending` $\rightarrow$ `cod_confirmed` $\rightarrow$ `collected` (or `failed` / `cancelled`).

#### 3.3.4. Transaction-Safe Stock Safeguard on Status Change (`/api/admin/orders/status`)
- **How It Works:**
  - **Cancellation (Stock Release):**
    - Transitioning an order to `cancelled` automatically returns all item quantities back to `products.stock` and `product_variants.stock`, while reducing `total_sold`.
    - Orders already marked as `shipped`, `out_for_delivery`, or `delivered` cannot be cancelled; they must be marked as `returned` once received back.
  - **Reopening (Stock Re-Reservation):**
    - Transitioning a previously `cancelled` order back to an active state checks inventory first.
    - If any product or size variant in the order has insufficient stock in the warehouse, the operation is blocked with a `409 Conflict` error.
    - If stock is available, quantities are re-deducted.
  - All operations run inside an atomic SQLite transaction (`BEGIN TRANSACTION` / `COMMIT`).

#### 3.3.5. Internal Timeline Logging
- **How It Works:**
  - Every status change logs an audit record to `order_timeline` capturing:
    - `order_id`
    - `status`
    - `note` (Custom remarks entered by staff)
    - `admin_id` (The administrator who performed the update)
    - `created_at` (Timestamp)

#### 3.3.6. One-Click Phone & WhatsApp Verification Bridge
- **How It Works:**
  - **Direct Phone Dial:** Native `tel:{order.shipping_phone}` link for mobile devices or desktop softphones.
  - **WhatsApp Verification Bridge:** Generates an automated deep link:
    ```
    https://wa.me/{shipping_phone}?text=Hello {shipping_name}! This is Nobo Fashion regarding your Cash on Delivery order #{order_number}.
    ```
  - Allows staff to verify customer phone numbers and addresses in seconds.

---

### 3.4. Live Customer Support Desk (`/admin/chat`)

#### 3.4.1. 3-Column Support Workstation
- **How It Works:**
  - Built specifically for high-volume customer service.
  - **Column 1 — Active Conversations:**
    - Lists all conversations ordered by `last_message_at DESC`.
    - Displays a live green online presence indicator when the customer's browser is active.
    - Shows unread message count badges.
  - **Column 2 — Real-Time Chat Stream:**
    - Displays chat history.
    - Incoming messages appear in real time via Socket.IO events (`message:new`).
    - Includes typing indicators (`typing:show` / `typing:stop`).
    - Features a **Canned Quick Replies** toolbar for inserting frequent responses (e.g., standard sizing, delivery times, payment verification).
  - **Column 3 — Customer CRM Context:**
    - Displays customer profile information, phone number, and registration date.
    - Displays financial aggregates: Total lifetime COD spent and total order count.
    - Shows a list of recent customer orders with status badges and links to view order details.
    - Provides a direct link to escalate the conversation to WhatsApp.

---

### 3.5. Product Catalog & Variant Editor (`/admin/products`)

#### 3.5.1. Multi-Image Asset Management
- **How It Works:**
  - Powered by `MultiImageUploader` and `/api/admin/upload`.
  - Supports uploading multiple product photos simultaneously.
  - Automatically identifies MIME types (JPEG, PNG, WebP, GIF, SVG, AVIF) and generates collision-resistant filenames.
  - **Serverless Resilience:** When running in ephemeral cloud environments (like Vercel), converts uploads to Base64 Data URIs to prevent broken image links on serverless container restarts.
  - Designates a primary display photo (`is_primary = 1`) and maintains sort orders.

#### 3.5.2. Fashion Sizing Presets Engine
- **How It Works:**
  - When creating a garment, administrators can click one-touch presets:
    - **Free Size:** Generates a single `Free` size variant with standard stock.
    - **Standard Clothing:** Generates `S`, `M`, `L`, `XL`, `XXL` variants with preset stock distributions.
    - **Numeric Sizing:** Generates `38`, `40`, `42`, `44`, `46`, `48`, `50`, `52` variants for stitched three-pieces, kurtis, and ethnic wear.
  - Administrators can also add custom size names, specific SKU extensions, color names, and individual price overrides.
  - Product master stock automatically calculates as the sum of all variant stocks.

#### 3.5.3. Merchandising Flags
- **How It Works:**
  - Checkboxes toggle promotional attributes in the database:
    - `is_featured`: Displays in homepage featured collections.
    - `is_new_arrival`: Flags product with a "NEW" badge.
    - `is_best_seller`: Flags product with a "HOT / BEST SELLER" badge.

#### 3.5.4. Soft-Archive Deletion Protection
- **How It Works:**
  - Deleting a product checks `SELECT id FROM order_items WHERE product_id = ? LIMIT 1`.
  - **No Order References:** Permanently deletes product, variants, and images.
  - **Has Historical Orders:** Soft-archives the product by setting `is_active = 0`. This hides the item from the storefront while preserving past customer order records and invoice integrity.

---

### 3.6. Category & Navigation Management (`/admin/categories`)

- **How It Works:**
  - Lists all product categories with their current product count.
  - Allows creating categories with name, auto-generated slug, description, image, and sort order.
  - **One-Click Live Display Toggles:**
    - `show_in_sidebar`: Toggles presence in the shop sidebar filter.
    - `show_in_header`: Toggles presence in the top navigation menu.
    - `show_on_homepage`: Toggles display on the homepage carousel.
    - `is_active`: Enables or disables the category platform-wide.
  - Uses optimistic UI updates with an immediate background `PATCH` request to `/api/admin/categories`.

---

### 3.7. Inventory & Warehouse Stock Adjuster (`/admin/inventory`)

- **How It Works:**
  - Provides a single warehouse screen listing every active product, SKU, total stock, and variant stock.
  - **Low Stock Filter:** Toggles visibility to show only items where `stock <= low_stock_threshold` (default $\le 5$).
  - **Instant Stock Adjustment Controls:**
    - Staff can click `+` and `−` buttons next to any individual size variant.
    - Sends an atomic adjustment request to `/api/admin/inventory/adjust` with `{ productId, variantId, delta }`.
    - Updates variant stock: `stock = MAX(0, stock + delta)`.
    - Updates master product stock: `stock = MAX(0, stock + delta)`.
    - Creates an immutable audit record in `inventory_logs` recording previous stock, new stock, delta, reason (`Manual Admin Adjustment`), timestamp, and admin ID.

---

### 3.8. Customer CRM Directory (`/admin/customers`)

- **How It Works:**
  - Displays registered customer accounts.
  - Aggregates metrics per customer via SQL joins:
    ```sql
    SELECT u.*, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.user_type = 'customer'
    GROUP BY u.id
    ORDER BY u.id DESC
    ```
  - Displays customer name, phone number (clickable `tel:`), email, order count, total COD revenue spent, and registration date.

---

### 3.9. Coupons & Discount Manager (`/admin/coupons`)

- **How It Works:**
  - Interface for creating promotional discount codes.
  - Configurable parameters:
    - **Code:** Auto-normalized to uppercase, whitespace stripped.
    - **Discount Type:** `percentage` or `fixed`.
    - **Discount Value:** Percentage number (validated $\le 100$) or flat Taka amount.
    - **Minimum Order Amount:** Required cart subtotal to unlock discount.
    - **Maximum Discount Cap:** Optional ceiling limit for percentage discounts (e.g. max `৳500`).
    - **Expiry Date:** Calendar cutoff date.
    - **Usage Limit:** Total allowable platform redemptions.
  - Displays real-time redemption counters (`used_count`) and active status toggles.

---

### 3.10. Global Store & Delivery Settings (`/admin/settings`)

- **How It Works:**
  - Manages global key-value configuration stored in the `settings` table:
    - **Store Profile:** Store name, tagline, hotline phone numbers, complaints phone, support email, physical address.
    - **Branding Assets:** Store logo and favicon URLs.
    - **Delivery Fee Structure:**
      - `delivery_dhaka`: Flat rate for delivery inside Dhaka (e.g. `৳80`).
      - `delivery_outside_dhaka`: Flat rate for delivery outside Dhaka (e.g. `৳150`).
      - `free_delivery_threshold`: Minimum cart value for free shipping.
    - **Default SEO Meta:** Meta title and meta description fallback templates.
  - Submitting updates executes SQL upsert statements (`INSERT ... ON CONFLICT(key) DO UPDATE`).

---

## 4. Database Schema Blueprint (To Replicate in Another Project)

To replicate these features in another framework (Node/Express, Laravel, Django, Next.js, etc.), implement these primary tables and relations:

### 4.1. Core Tables Summary

| Table Name | Primary Purpose | Key Fields |
|---|---|---|
| `users` | Accounts for customers & administrators | `id`, `name`, `email`, `phone`, `password_hash`, `user_type`, `status` |
| `roles` & `permissions` | Role-Based Access Control | `roles.name`, `permissions.name`, `role_permissions(role_id, permission_id)` |
| `addresses` | Saved customer shipping destinations | `user_id`, `label`, `name`, `phone`, `address`, `city`, `zone`, `is_default` |
| `categories` | Product classification & navigation | `name`, `slug`, `image`, `show_in_sidebar`, `show_in_header`, `show_on_homepage`, `sort_order`, `is_active` |
| `products` | Main catalog items | `name`, `slug`, `sku`, `price`, `sale_price`, `stock`, `low_stock_threshold`, `category_id`, `is_featured`, `is_new_arrival`, `is_best_seller`, `total_sold`, `is_active` |
| `product_variants` | Size, color & SKU variations | `product_id`, `size_name`, `color_name`, `sku`, `price`, `stock`, `sold_count`, `is_active` |
| `product_images` | Gallery photos | `product_id`, `url`, `alt`, `is_primary`, `sort_order` |
| `orders` | Customer purchases | `order_number`, `user_id`, `shipping_name`, `shipping_phone`, `shipping_address`, `shipping_zone`, `subtotal`, `discount`, `delivery_charge`, `total`, `payment_method`, `payment_status`, `order_status` |
| `order_items` | Products in an order | `order_id`, `product_id`, `variant_id`, `product_name`, `product_sku`, `size_name`, `quantity`, `price`, `total` |
| `order_timeline` | Status change history & notes | `order_id`, `status`, `note`, `admin_id`, `created_at` |
| `invoices` | Billing records with JSON snapshot | `invoice_number`, `order_id`, `user_id`, `invoice_data`, `total`, `payment_status` |
| `inventory_logs` | Warehouse stock adjustment audit | `product_id`, `variant_id`, `adjustment`, `previous_stock`, `new_stock`, `reason`, `admin_id` |
| `coupons` | Promotional vouchers | `code`, `discount_type`, `discount_value`, `min_order_amount`, `max_discount`, `expiry_date`, `usage_limit`, `used_count`, `is_active` |
| `conversations` | Support chat threads | `user_id`, `admin_id`, `status`, `last_message`, `unread_admin`, `unread_customer` |
| `messages` | Chat messages | `conversation_id`, `sender_id`, `sender_type`, `message`, `is_read`, `created_at` |
| `settings` | Key-value store configuration | `key` (PRIMARY KEY), `value`, `updated_at` |

---

## 5. Implementation Checklist for Your New Website

Use this step-by-step checklist when building these features into your target platform:

### Phase 1: Database & Foundation
- [ ] Create the relational schema (Users, Roles, Products, Variants, Images, Orders, Items, Invoices, Timeline, Coupons, Chat, Settings).
- [ ] Configure password hashing with salted bcrypt.
- [ ] Seed default roles (`Super Admin`, `Manager`, etc.) and system permissions.

### Phase 2: Catalog & Storefront Browsing
- [ ] Build product CRUD with support for multi-image uploads.
- [ ] Implement size variant generator with presets (Free Size, Standard Clothing, Numeric Sizing).
- [ ] Build the public catalog with live search, category filtering, price filtering, and sorting.
- [ ] Build product detail page with active thumbnail switcher, variant selector, and dynamic price updates.
- [ ] Add the "Order via WhatsApp" pre-filled message generator.

### Phase 3: Cart, Discounts & Checkout
- [ ] Implement cart state with composite key (`productId-sizeName-colorName`).
- [ ] Implement the coupon validation engine (minimum order check, percentage cap, expiry).
- [ ] Implement delivery fee calculation by regional zone (Inside vs. Outside district).
- [ ] Build single-page COD checkout.
- [ ] Implement server-side price re-validation and guest auto-account creation by phone.
- [ ] Implement automated invoice generation and stock deduction on order placement.

### Phase 4: Order Fulfillment & Admin Operations
- [ ] Build the admin dashboard with KPI metric aggregators.
- [ ] Build the order fulfillment manager with 10-stage order dispatch and 5-stage payment trackers.
- [ ] Implement stock safeguards (auto-release on cancellation, re-reservation on reopening).
- [ ] Add internal timeline notes and one-click phone/WhatsApp verification buttons.
- [ ] Implement printable A4 invoices with CSS print styles.
- [ ] Build the inventory stock management screen with `+` / `−` adjustments and audit logging.

### Phase 5: Real-Time Communication
- [ ] Integrate WebSocket server (e.g. Socket.IO) for real-time customer support.
- [ ] Build customer floating chat widget with guest registration (name & phone).
- [ ] Build admin 3-column chat console with customer CRM context, order history sidebar, and online presence indicators.

