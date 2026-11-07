const fs = require("node:fs");
const path = require("node:path");
const seedProducts = require("./products");

const dataFile = path.join(__dirname, "store.json");
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
    schemaVersion: 3,
    sessionSecret: require("node:crypto").randomBytes(48).toString("hex"),
    users: [],
    roles: ["Super Admin", "Manager", "Order Manager", "Product Manager", "Customer Support", "Inventory Manager"],
    categories,
    products,
    banners: [
      { id: "banner-one", eyebrow: "MADE FOR WHAT’S NEXT", title: "A little more\nwonder in every day.", description: "Meet the devices that make your big ideas, daily rituals, and everything in between feel effortless.", note: "MacBook Air · Built for the long run", image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1400&q=88", alt: "A slim silver laptop on a bright desk", active: true, sortOrder: 0 },
      { id: "banner-two", eyebrow: "A NEW WAY TO SEE IT", title: "Your world,\na little closer.", description: "A brilliant camera, thoughtful design, and all the things you love—right where you need them.", note: "iPhone · Made to move with you", image: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1400&q=88", alt: "A smartphone photographed on a clean surface", active: true, sortOrder: 1 },
      { id: "banner-three", eyebrow: "SOUND THAT STAYS WITH YOU", title: "Find your own\nkind of quiet.", description: "Settle into every note with personal audio made for your commute, your focus, and your off-switch.", note: "Audio · Your space, anywhere", image: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1400&q=88", alt: "Wireless earbuds in a charging case", active: true, sortOrder: 2 },
    ],
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
  if (!fs.existsSync(dataFile)) {
    const data = initialData();
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
    return data;
  }
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    let changed = false;
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
        if (data.settings[key] === undefined || (!data.settings[key] && value)) {
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
    if (changed) write(data);
    return data;
  } catch (error) {
    error.message = `Could not read ${dataFile}: ${error.message}`;
    throw error;
  }
}

function write(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
  return data;
}

function update(mutator) {
  const data = read();
  const result = mutator(data);
  write(data);
  return result;
}

module.exports = { read, write, update, dataFile };
