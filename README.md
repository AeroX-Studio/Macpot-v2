# MacPoint Node.js + EJS storefront

MacPoint is a responsive Apple-focused storefront built with Node.js, Express 5, and EJS. Express renders the pages and catalog on the server; EJS partials keep repeated product markup in one place. The interface uses the requested black-and-white theme, Manrope typography, and reduced-motion-aware animation.

## Start the app

Requirements: Node.js 22 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Use `npm start` for a standard production-mode process. The port can be changed with the `PORT` environment variable.

## Project layout

```text
data/
  products.js              Sample catalog data passed to EJS
public/
  css/styles.css           Responsive monochrome styling
  js/storefront.js         Search, filters, carousel, wishlist, and bag UI
views/
  index.ejs                Server-rendered home page
  partials/product-card.ejs
  404.ejs
  error.ejs
server.js                  Express app and routes
```

`GET /healthz` returns a small JSON health response. The home page receives catalog data from `data/products.js` and renders each product through the EJS product-card partial.

## Deploying to Vercel

Vercel serves the files in `public/` as static assets and runs the Express app from `server.js`. `vercel.json` includes the EJS templates and data modules in the function bundle. In Vercel, the JSON store uses `/tmp` so requests do not try to write into the read-only deployment bundle. `/tmp` is temporary and can be cleared between function instances or deployments, so it is only suitable for a demo. Use a hosted database before relying on Vercel for customer accounts, orders, inventory, or other persistent store data. Set `MACPOINT_DATA_FILE` only when you have a writable persistent filesystem available.

## Current scope

The sample BDT prices are illustrative. Search, filters, wishlist, and shopping bag currently run in the browser; they do not persist to an account or database. Authentication, customer/admin dashboards, checkout, inventory, order management, payment gateways, and newsletter delivery still need backend and service integration. Never treat the sample catalog as live stock or pricing.

Manrope and the sample photography load from external hosts.
"# Macpot-v2" 
