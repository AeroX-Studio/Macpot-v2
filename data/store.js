const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const seedProducts = require("./products");
const presentation = require("./presentation");

const legacyDataFile = process.env.MACPOINT_DATA_FILE || (process.env.VERCEL === "1"
  ? path.join(os.tmpdir(), "macpoint-store.json")
  : path.join(__dirname, "store.json"));
const dataFile = process.env.MACPOINT_DATABASE_FILE || legacyDataFile.replace(/\.json$/i, '') + '.sqlite';
const database = require('./database')(dataFile);
const categoryDescriptions = {
  Mac: "Power for your ideas",
  iPhone: "A world in your pocket",
  iPad: "Your ideas, in motion",
  Audio: "Find your frequency",
  Watch: "A little closer to you",
  Accessories: "The finishing touch",
};
const settingsDefaults = {
  storeName: "MacPoint",
  tagline: "Thoughtful technology. Personal service.",
  hotline: "01700000000",
  complaintsPhone: "01700000000",
  supportEmail: "care@macpoint.com.bd",
  address: "Dhaka, Bangladesh",
  logoUrl: "",
  faviconUrl: "",
  deliveryDhaka: 80,
  deliveryOutsideDhaka: 150,
  freeDeliveryThreshold: 0,
  seoTitle: "MacPoint — Apple, thoughtfully chosen",
  seoDescription: "Discover Apple devices and everyday essentials at MacPoint Bangladesh.",
  whatsapp: "01700000000",
  nextOrderNumber: 1,
};

function initialData() {
  const categories = [...new Set(seedProducts.map((product) => product.category))].map((name, index) => ({
    id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: categoryDescriptions[name] || "Thoughtful technology, chosen for you",
    image: seedProducts.find((product) => product.category === name)?.image || "",
    sortOrder: index,
    showInSidebar: true,
    showInHeader: true,
    showOnHomepage: true,
    active: true,
  }));
  const products = seedProducts.map((product, index) => ({
    ...product,
    slug: product.id,
    sku: `MP-${product.id.toUpperCase()}`,
    salePrice: null,
    stock: 20 + index * 3,
    lowStockThreshold: 4,
    totalSold: [18, 15, 12, 11, 9, 7, 6, 5][index] || 0,
    active: true,
    featured: index < 4,
    newArrival: product.badge === "New" || product.badge === "Just in",
    bestSeller: product.badge === "Bestseller" || product.badge === "Popular",
    tags: [product.category.toLowerCase(), product.badge.toLowerCase().replace(/\s+/g, "-")],
    images: [{ url: product.image, alt: product.alt, primary: true, sortOrder: 0 }],
    variants: [
      { id: `${product.id}-base`, name: "Standard", color: "", sku: `MP-${product.id.toUpperCase()}-STD`, price: null, stock: 12 + index * 2, active: true },
      { id: `${product.id}-256`, name: "256 GB", color: "Space Black", sku: `MP-${product.id.toUpperCase()}-256`, price: Math.round(product.price * 1.1), stock: 5 + index, active: true },
      { id: `${product.id}-512`, name: "512 GB", color: "Silver", sku: `MP-${product.id.toUpperCase()}-512`, price: Math.round(product.price * 1.22), stock: 3 + index, active: true },
    ],
  }));
  return {
    schemaVersion: 4,
    sessionSecret: require("node:crypto").randomBytes(48).toString("hex"),
    users: [],
    roles: ["Super Admin", "Manager", "Order Manager", "Product Manager", "Customer Support", "Inventory Manager"],
    categories: categories.map(category => ({ ...category, image: presentation.images[seedProducts.find(p => p.category === category.name)?.id] || category.image })),
    products: products.map(product => {
      const image = presentation.images[product.id];
      if (image) { product.image = image; product.images[0].url = image; }
      if (['Audio', 'Accessories', 'Watch'].includes(product.category)) {
        product.variants = [{ ...product.variants[0], name: product.category === 'Watch' ? 'Standard case' : 'Standard', stock: product.stock }];
      } else product.stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
      return product;
    }),
    banners: presentation.banners,
    orders: [],
    invoices: [],
    wishlists: [],
    coupons: [],
    inventoryLogs: [],
    conversations: [],
    messages: [],
    notifications: [],
    sessions: [],
    addresses: [],
    subscribers: [],
    settings: { ...settingsDefaults },
  };
}

function read() {
  try {
    let data = database.read();
    let changed = !data;
    if (!data) data = fs.existsSync(legacyDataFile) ? JSON.parse(fs.readFileSync(legacyDataFile, 'utf8')) : initialData();
    if (!Array.isArray(data.wishlists)) { data.wishlists = []; changed = true; }
    if (!Array.isArray(data.banners)) { data.banners = initialData().banners; changed = true; }
    if (!Array.isArray(data.inventoryLogs)) { data.inventoryLogs = []; changed = true; }
    if (!Array.isArray(data.addresses)) { data.addresses = []; changed = true; }
    if (!Array.isArray(data.notifications)) { data.notifications = []; changed = true; }
    if (!Array.isArray(data.sessions)) { data.sessions = []; changed = true; }
    if (!data.sessionSecret) { data.sessionSecret = require("node:crypto").randomBytes(48).toString("hex"); changed = true; }
    if (!data.settings) { data.settings = { ...settingsDefaults }; changed = true; }
    if (data.settings) {
      for (const [key, value] of Object.entries(settingsDefaults)) {
        if (data.settings[key] === undefined) {
          data.settings[key] = value;
          changed = true;
        }
      }
    }
    if (Number(data.schemaVersion || 1) < 2) {
      if (!data.orders?.length) {
        data.products.forEach((product) => {
          if (product.variants?.length) product.stock = product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
        });
      }
      data.schemaVersion = 2;
      changed = true;
    }
    if (Number(data.schemaVersion || 1) < 3) {
      data.products.forEach((product) => {
        if (product.variants?.length) product.stock = product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
      });
      data.schemaVersion = 3;
      changed = true;
    }
    if (Number(data.schemaVersion || 1) < 4) {
      data.products.forEach(product => {
        const seed = seedProducts.find(item => item.id === product.id);
        const image = presentation.images[product.id];
        if (seed && image && product.image === seed.image) {
          product.image = image;
          product.images.forEach(item => { if (item.url === seed.image) item.url = image; });
          data.categories.forEach(category => { if (category.image === seed.image) category.image = image; });
        }
      });
      const originalTitles = ['A little more\nwonder in every day.', 'Your world,\na little closer.', 'Find your own\nkind of quiet.'];
      data.banners = data.banners.map(banner => {
        const index = originalTitles.indexOf(banner.title);
        return index >= 0 && banner.id === presentation.banners[index].id ? { ...presentation.banners[index], active: banner.active, sortOrder: banner.sortOrder } : banner;
      });
      data.schemaVersion = 4;
      changed = true;
    }
    if (changed) write(data);
    return data;
  } catch (error) {
    error.message = `Could not read ${dataFile}: ${error.message}`;
    throw error;
  }
}

function write(data) { return database.write(data); }

function update(mutator) {
  const data = read();
  const result = mutator(data);
  write(data);
  return result;
}

module.exports = { read, write, update, dataFile, close: database.close };
