const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const store = require("./data/store");

const app = express();
const httpServer = require("node:http").createServer(app);
const port = Number.parseInt(process.env.PORT || "3000", 10);
const publicDirectory = path.join(__dirname, "public");
const scrypt = promisify(crypto.scrypt);
const fulfillmentStatuses = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"];
const paymentStatuses = ["pending", "cod_confirmed", "collected", "failed", "cancelled"];
const fulfillmentLabels = {
  pending: "Order placed", confirmed: "Phone confirmed", processing: "Preparing", packed: "Packed",
  shipped: "With courier", out_for_delivery: "Out for delivery", delivered: "Delivered",
  cancelled: "Cancelled", returned: "Returned", refunded: "Refunded",
};
const rolePermissions = require("./data/roles");
const realtime = process.env.VERCEL === "1" ? null : require("./lib/realtime")(httpServer, hasPermission);
app.httpServer = httpServer;
app.realtime = realtime;

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
const staticOptions = {
  maxAge: 0,
  etag: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  },
};
app.use("/css", express.static(path.join(publicDirectory, "css"), staticOptions));
app.use("/js", express.static(path.join(publicDirectory, "js"), staticOptions));
app.use(express.static(publicDirectory, staticOptions));
app.get("/js/socket.io.js", (_request, response) => response.sendFile(path.join(path.dirname(require.resolve("socket.io-client/package.json")), "dist/socket.io.min.js")));

const money = (amount) => Number(amount || 0).toLocaleString("en-BD");
const slugify = (value) => String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const makeId = (prefix) => `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
const safeUser = (user) => user && ({ id: user.id, name: user.name, email: user.email, phone: user.phone, userType: user.userType, role: user.role, createdAt: user.createdAt });
const activeProducts = (data) => data.products.filter((product) => product.active);
const getProduct = (data, slugOrId) => data.products.find((product) => product.active && (product.slug === slugOrId || product.id === slugOrId));
const getCategory = (data, slug) => data.categories.find((category) => category.active && category.slug === slug);
const basePrice = (product) => Number(product.salePrice || product.price || 0);
const variantPrice = (product, variant) => Number((variant && variant.price) || basePrice(product));
const availableStock = (product, variant) => Number(variant ? variant.stock : product.stock);
const itemImage = (product) => product.images?.find((image) => image.primary)?.url || product.images?.[0]?.url || product.image;
const sortProducts = (items, sort) => {
  const result = [...items];
  if (sort === "price_asc") result.sort((a, b) => basePrice(a) - basePrice(b));
  else if (sort === "price_desc") result.sort((a, b) => basePrice(b) - basePrice(a));
  else if (sort === "best_seller") result.sort((a, b) => Number(b.bestSeller) - Number(a.bestSeller) || b.totalSold - a.totalSold);
  else result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.newArrival) - Number(a.newArrival) || b.id.localeCompare(a.id));
  return result;
};

function validPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return scrypt(String(password), salt, 64).then((derived) => `${salt}:${derived.toString("hex")}`);
}

function randomPasswordHash() {
  const salt = crypto.randomBytes(16).toString("hex");
  const password = crypto.randomBytes(32).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

async function passwordMatches(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expectedHex] = stored.split(":");
  const actual = await scrypt(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function signSession(id, secret) {
  return crypto.createHmac("sha256", secret).update(id).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.indexOf("=");
    return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
  }));
}

function setSessionCookie(response, sessionId, secret) {
  const token = `${sessionId}.${signSession(sessionId, secret)}`;
  response.cookieValue = token;
  response.setHeader("Set-Cookie", `macpoint_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `macpoint_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

function createSession(userId) {
  return store.update((data) => {
    const id = crypto.randomBytes(32).toString("hex");
    data.sessions = data.sessions.filter((session) => session.expiresAt > Date.now());
    data.sessions.push({ id, userId, csrf: crypto.randomBytes(20).toString("hex"), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    return { id, csrf: data.sessions.at(-1).csrf, secret: data.sessionSecret };
  });
}

app.use((request, response, next) => {
  try {
    const data = store.read();
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies.macpoint_session || "";
    const separator = token.lastIndexOf(".");
    let session;
    if (separator > 0) {
      const id = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      const expected = signSession(id, data.sessionSecret);
      const incomingBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (incomingBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(incomingBuffer, expectedBuffer)) {
        session = data.sessions.find((item) => item.id === id && item.expiresAt > Date.now());
      }
    }
    const sessionUser = session ? data.users.find((user) => user.id === session.userId && user.status !== "inactive") : null;
    request.state = { data, session, user: sessionUser };
    response.locals.currentUser = safeUser(request.state.user);
    response.locals.settings = data.settings;
    response.locals.csrf = session?.csrf || "";
    const noticeCookie = parseCookies(request.headers.cookie).macpoint_notice || "";
    const [noticeKind, ...noticeParts] = noticeCookie.split("|");
    response.locals.notice = noticeParts.length ? { kind: noticeKind, message: noticeParts.join("|") } : null;
    response.locals.year = new Date().getFullYear();
    response.locals.formatPrice = money;
    response.locals.statusLabel = (status) => fulfillmentLabels[status] || status;
    response.locals.canAdmin = (permission) => hasPermission(request.state.user, permission);
    response.locals.cartCount = 0;
    response.locals.realtimeEnabled = Boolean(realtime);
    response.locals.activeCategories = data.categories.filter((category) => category.active && category.showInHeader).sort((a, b) => a.sortOrder - b.sortOrder);
    next();
  } catch (error) {
    next(error);
  }
});

app.use((request, response, next) => {
  if (!request.method.match(/^(POST|PUT|PATCH|DELETE)$/)) return next();
  const origin = request.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).host !== request.get("host")) return response.status(403).json({ error: "Request origin was not accepted." });
  } catch (_error) {
    return response.status(403).json({ error: "Request origin was not accepted." });
  }
  next();
});

function requireCustomer(request, response, next) {
  if (request.state.user?.userType === "customer") return next();
  const callback = encodeURIComponent(request.originalUrl);
  response.redirect(`/login?next=${callback}`);
}

function requireAdmin(request, response, next) {
  if (!request.state.data.users.some((user) => user.userType === "admin")) return response.redirect("/admin/setup");
  if (request.state.user?.userType !== "admin") return response.redirect(`/admin/login?next=${encodeURIComponent(request.originalUrl)}`);
  next();
}

function hasPermission(user, permission) {
  if (!user || user.userType !== "admin") return false;
  const permissions = rolePermissions[user.role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function requirePermission(permission) {
  return (request, response, next) => {
    if (!hasPermission(request.state.user, permission)) return response.status(403).render("error", { title: "Access denied — MacPoint", message: "Your account does not have permission to open this area." });
    next();
  };
}

function setFlash(response, kind, message) {
  response.setHeader("Set-Cookie", `macpoint_notice=${encodeURIComponent(`${kind}|${message}`)}; Path=/; SameSite=Lax; Max-Age=8`);
}

function applyCoupon(data, code, subtotal) {
  const normalized = String(code || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!normalized) return { coupon: null, discount: 0 };
  const coupon = data.coupons.find((item) => item.code === normalized && item.active);
  if (!coupon) throw new Error("That code is not active or could not be found.");
  if (coupon.expiryDate && coupon.expiryDate < new Date().toISOString().slice(0, 10)) throw new Error("That code has expired.");
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new Error("That code has reached its usage limit.");
  if (subtotal < Number(coupon.minOrderAmount || 0)) throw new Error(`Add ${money(Number(coupon.minOrderAmount) - subtotal)} more to use this code.`);
  let discount = coupon.type === "percentage" ? Math.round(subtotal * Number(coupon.value) / 100) : Number(coupon.value);
  if (coupon.type === "percentage" && coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = Math.min(Math.max(0, discount), subtotal);
  return { coupon, discount };
}

function calculateDelivery(data, subtotal, zone) {
  const threshold = Number(data.settings.freeDeliveryThreshold || 0);
  if (threshold > 0 && subtotal >= threshold) return 0;
  return zone === "dhaka" ? Number(data.settings.deliveryDhaka || 0) : Number(data.settings.deliveryOutsideDhaka || 0);
}

function getFilteredProducts(data, query) {
  const requestedCategory = getCategory(data, query.category)?.name || query.category;
  let items = activeProducts(data).filter((product) => {
    if (requestedCategory && product.category.toLowerCase() !== String(requestedCategory).toLowerCase()) return false;
    const term = String(query.q || "").trim().toLowerCase();
    if (term && !`${product.name} ${product.description} ${product.sku} ${(product.tags || []).join(" ")} ${product.category}`.toLowerCase().includes(term)) return false;
    if (query.size && !product.variants?.some((variant) => variant.active && variant.name.toLowerCase() === String(query.size).toLowerCase())) return false;
    if (query.tag && !(product.tags || []).includes(String(query.tag).toLowerCase())) return false;
    const price = basePrice(product);
    if (query.minPrice !== undefined && query.minPrice !== "" && price < Number(query.minPrice)) return false;
    if (query.maxPrice !== undefined && query.maxPrice !== "" && price > Number(query.maxPrice)) return false;
    return true;
  });
  return sortProducts(items, query.sort);
}

function publicProduct(product) {
  return {
    ...product,
    image: itemImage(product),
    price: Number(product.price || 0),
    variants: product.variants.filter((variant) => variant.active),
  };
}

app.get("/healthz", (_request, response) => response.json({ status: "ok" }));

app.get("/", (request, response) => {
  const { data } = request.state;
  response.render("index", {
    defaultBanners: require("./data/presentation").banners,
    title: data.settings.seoTitle || "MacPoint — Apple, thoughtfully chosen",
    year: new Date().getFullYear(),
    products: activeProducts(data).map(publicProduct),
    newArrivals: sortProducts(activeProducts(data).filter((product) => product.newArrival), "newest").slice(0, 4).map(publicProduct),
    bestSellers: sortProducts(activeProducts(data).filter((product) => product.bestSeller), "best_seller").slice(0, 4).map(publicProduct),
    banners: (data.banners || []).filter((banner) => banner.active).sort((a, b) => a.sortOrder - b.sortOrder),
    categories: data.categories.filter((category) => category.active && category.showOnHomepage).sort((a, b) => a.sortOrder - b.sortOrder),
    settings: data.settings,
  });
});

app.get("/help", (_request, response) => response.render("help", { title: "Delivery & support — MacPoint" }));

app.get("/shop", (request, response) => {
  const { data } = request.state;
  response.render("shop", {
    title: "Shop — MacPoint",
    category: null,
    products: getFilteredProducts(data, request.query).map(publicProduct),
    categories: data.categories.filter((category) => category.active && category.showInSidebar).map((category) => ({ ...category, productCount: activeProducts(data).filter((product) => product.category === category.name).length })).sort((a, b) => a.sortOrder - b.sortOrder),
    filters: request.query,
  });
});

app.get("/category/:slug", (request, response) => {
  const { data } = request.state;
  const category = getCategory(data, request.params.slug);
  if (!category) return response.status(404).render("404", { title: "Category not found — MacPoint", year: response.locals.year });
  response.render("shop", {
    title: `${category.name} — MacPoint`,
    category,
    products: getFilteredProducts(data, { ...request.query, category: category.name }).map(publicProduct),
    categories: data.categories.filter((item) => item.active && item.showInSidebar).map((item) => ({ ...item, productCount: activeProducts(data).filter((product) => product.category === item.name).length })).sort((a, b) => a.sortOrder - b.sortOrder),
    filters: request.query,
  });
});

app.get("/product/:slug", (request, response) => {
  const { data } = request.state;
  const product = getProduct(data, request.params.slug);
  if (!product) return response.status(404).render("404", { title: "Product not found — MacPoint", year: response.locals.year });
  response.render("product", { title: `${product.name} — MacPoint`, product: publicProduct(product), settings: data.settings });
});

app.get("/api/products/search", (request, response) => {
  const query = String(request.query.q || "").trim();
  if (query.length < 2) return response.json({ products: [] });
  const matches = getFilteredProducts(request.state.data, { q: query }).slice(0, 6).map((product) => ({
    id: product.id, name: product.name, slug: product.slug, category: product.category,
    image: itemImage(product), price: Number(product.price || 0), salePrice: product.salePrice ? Number(product.salePrice) : null,
  }));
  response.json({ products: matches });
});

app.get("/api/products/:slug", (request, response) => {
  const product = getProduct(request.state.data, request.params.slug);
  if (!product) return response.status(404).json({ error: "Product not found." });
  response.json({ product: publicProduct(product) });
});

app.post("/api/coupons/validate", (request, response) => {
  const data = request.state.data;
  let subtotal = 0;
  for (const item of request.body.items || []) {
    const product = getProduct(data, item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId && entry.active);
    if (!product || !variant) return response.status(400).json({ error: "One of the items in your bag is no longer available." });
    const quantity = Math.max(1, Math.min(99, Number.parseInt(item.quantity, 10) || 1));
    subtotal += variantPrice(product, variant) * quantity;
  }
  try {
    const { coupon, discount } = applyCoupon(data, request.body.code, subtotal);
    response.json({ code: coupon?.code || null, discount, subtotal, deliveryDhaka: calculateDelivery(data, subtotal, "dhaka"), deliveryOutsideDhaka: calculateDelivery(data, subtotal, "outside_dhaka"), total: subtotal - discount });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post("/api/orders", (request, response) => {
  const data = request.state.data;
  const shipping = request.body.shipping || {};
  const phone = validPhone(shipping.phone);
  const name = String(shipping.name || "").trim().slice(0, 120);
  const address = String(shipping.address || "").trim().slice(0, 500);
  const city = String(shipping.city || "").trim().slice(0, 100);
  const zone = shipping.zone === "dhaka" ? "dhaka" : shipping.zone === "outside_dhaka" ? "outside_dhaka" : null;
  const requestedItems = Array.isArray(request.body.items) ? request.body.items : [];
  if (!name || !phone || !address || !city || !zone || !requestedItems.length) return response.status(400).json({ error: "Enter your name, valid mobile number, delivery address, city, delivery area, and at least one item." });
  const requestedQuantities = new Map();
  for (const requested of requestedItems) {
    const key = `${String(requested.productId || "")}\u0000${String(requested.variantId || "")}`;
    requestedQuantities.set(key, (requestedQuantities.get(key) || 0) + Math.max(1, Math.min(99, Number.parseInt(requested.quantity, 10) || 1)));
  }
  const items = [];
  let subtotal = 0;
  for (const [key, quantity] of requestedQuantities) {
    const [productId, variantId] = key.split("\u0000");
    const product = getProduct(data, productId);
    const variant = product?.variants.find((entry) => entry.id === variantId && entry.active);
    if (!product || !variant) return response.status(400).json({ error: "An item in your bag is no longer available. Please refresh your bag." });
    if (availableStock(product, variant) < quantity) return response.status(409).json({ error: `${product.name} (${variant.name}) only has ${availableStock(product, variant)} available.` });
    const price = variantPrice(product, variant);
    subtotal += price * quantity;
    items.push({ productId: product.id, variantId: variant.id, productName: product.name, sku: variant.sku || product.sku, variantName: variant.name, color: variant.color || "", image: itemImage(product), quantity, price, total: price * quantity });
  }
  let couponResult;
  try { couponResult = applyCoupon(data, request.body.coupon, subtotal); }
  catch (error) { return response.status(400).json({ error: error.message }); }
  const deliveryCharge = calculateDelivery(data, subtotal, zone);
  const total = Math.max(0, subtotal - couponResult.discount + deliveryCharge);
  let user = request.state.user?.userType === "customer" ? request.state.user : data.users.find((entry) => entry.userType === "customer" && entry.phone === phone);
  if (!user) {
    user = { id: makeId("customer"), name, email: "", phone, passwordHash: randomPasswordHash(), mustClaimAccount: true, userType: "customer", status: "active", createdAt: new Date().toISOString() };
    data.users.push(user);
  }
  const sequence = Number(data.settings.nextOrderNumber || 1);
  data.settings.nextOrderNumber = sequence + 1;
  const orderNumber = `MP-${new Date().getFullYear()}-${String(sequence).padStart(6, "0")}`;
  const orderId = makeId("order");
  const invoiceNumber = `INV-${orderNumber}`;
  const accessToken = crypto.randomBytes(32).toString("base64url");
  const order = {
    id: orderId, orderNumber, invoiceNumber, userId: user.id, accessTokenHash: crypto.createHash("sha256").update(accessToken).digest("hex"),
    shippingName: name, shippingPhone: phone, shippingAddress: address, shippingCity: city, shippingZone: zone,
    notes: String(shipping.notes || "").trim().slice(0, 1000), subtotal, discount: couponResult.discount, couponCode: couponResult.coupon?.code || "",
    deliveryCharge, total, paymentMethod: "cod", paymentStatus: "pending", orderStatus: "pending", items,
    timeline: [{ status: "pending", note: "Order placed successfully by customer via Cash on Delivery.", adminId: null, createdAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(), stockReserved: true,
  };
  for (const item of items) {
    const product = data.products.find((entry) => entry.id === item.productId);
    const variant = product.variants.find((entry) => entry.id === item.variantId);
    variant.stock -= item.quantity;
    variant.soldCount = Number(variant.soldCount || 0) + item.quantity;
    product.stock = product.variants.reduce((sum, entry) => sum + Number(entry.stock || 0), 0);
    product.totalSold = Number(product.totalSold || 0) + item.quantity;
  }
  if (couponResult.coupon) couponResult.coupon.usedCount += 1;
  data.orders.push(order);
  const invoice = {
    id: makeId("invoice"), invoiceNumber, orderId, userId: user.id, total,
    data: { storeName: data.settings.storeName, settings: { ...data.settings }, order: JSON.parse(JSON.stringify(order)), generatedAt: new Date().toISOString() },
  };
  data.invoices.push(invoice);
  data.notifications.unshift({ id: makeId("notice"), text: `New order ${orderNumber}: ${name} placed a COD order of ৳${money(total)}.`, orderId, createdAt: new Date().toISOString(), read: false });
  if (!data.addresses.some((entry) => entry.userId === user.id && entry.address === address && entry.city === city)) {
    data.addresses.push({ id: makeId("address"), userId: user.id, label: "Home", name, phone, address, city, zone, isDefault: !data.addresses.some((entry) => entry.userId === user.id), createdAt: new Date().toISOString() });
  }
  store.write(data);
  response.status(201).json({ orderNumber, url: `/order-success/${encodeURIComponent(orderNumber)}?access=${encodeURIComponent(accessToken)}` });
});

app.get("/checkout", (request, response) => {
  response.render("checkout", { title: "Checkout — MacPoint", settings: request.state.data.settings, savedAddresses: request.state.user ? request.state.data.addresses.filter((item) => item.userId === request.state.user.id) : [] });
});

app.get("/order-success/:orderNumber", (request, response) => {
  const order = request.state.data.orders.find((item) => item.orderNumber === request.params.orderNumber);
  const token = String(request.query.access || "");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  if (!order || !token || hash.length !== order.accessTokenHash.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(order.accessTokenHash))) return response.status(404).render("404", { title: "Order not found — MacPoint", year: response.locals.year });
  const accountUser = request.state.data.users.find((user) => user.id === order.userId);
  response.render("order-success", { title: "Order status — MacPoint", order, requestAccess: token, canClaimAccount: Boolean(accountUser?.mustClaimAccount && request.state.user?.id !== accountUser.id) });
});

app.post("/order-success/:orderNumber/claim-account", async (request, response, next) => {
  try {
    const order = request.state.data.orders.find((item) => item.orderNumber === request.params.orderNumber);
    const token = String(request.body.access || "");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    if (!order || !token || hash.length !== order.accessTokenHash.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(order.accessTokenHash))) return response.status(404).render("404", { title: "Order not found — MacPoint", year: response.locals.year });
    const accountUser = request.state.data.users.find((user) => user.id === order.userId && user.mustClaimAccount && user.status !== "inactive");
    if (!accountUser) { setFlash(response, "error", "This customer account is already set up."); return response.redirect(`/order-success/${encodeURIComponent(order.orderNumber)}?access=${encodeURIComponent(token)}`); }
    const password = String(request.body.password || "");
    if (password.length < 8 || password !== String(request.body.confirmPassword || "")) { setFlash(response, "error", "Choose matching passwords with at least 8 characters."); return response.redirect(`/order-success/${encodeURIComponent(order.orderNumber)}?access=${encodeURIComponent(token)}`); }
    const hashedPassword = await passwordHash(password);
    store.update((data) => {
      const user = data.users.find((entry) => entry.id === accountUser.id && entry.mustClaimAccount);
      if (user) { user.passwordHash = hashedPassword; user.mustClaimAccount = false; }
    });
    const session = createSession(accountUser.id);
    setSessionCookie(response, session.id, session.secret);
    response.redirect("/account");
  } catch (error) { next(error); }
});

function safeLoginDestination(value, user) {
  const fallback = user.userType === 'admin' ? '/admin' : '/account';
  const candidate = String(value || '');
  if (!candidate.startsWith('/') || candidate.startsWith('//') || /[\\\r\n]/.test(candidate)) return fallback;
  if (user.userType === 'admin' && /^\/account(?:\/|\?|$)/.test(candidate)) return '/admin';
  if (user.userType !== 'admin' && /^\/admin(?:\/|\?|$)/.test(candidate)) return '/account';
  if (/^\/(?:admin\/)?login(?:\?|$)/.test(candidate)) return fallback;
  return candidate;
}

app.get(['/login', '/admin/login'], (request, response) => {
  const adminMode = request.path === '/admin/login' || /^\/admin(?:\/|$)/.test(String(request.query.next || ''));
  if (request.state.user && (!adminMode || request.state.user.userType === 'admin')) return response.redirect(safeLoginDestination(request.query.next, request.state.user));
  response.render('login', { title: adminMode ? 'Admin sign in — MacPoint' : 'Sign in — MacPoint', adminMode, identity: '', next: request.query.next || '', message: '', setupAvailable: !requestHasAdmin(request) });
});

app.get("/order-success/:orderNumber/invoice", (request, response) => {
  const data = request.state.data;
  const order = data.orders.find((item) => item.orderNumber === request.params.orderNumber);
  const token = String(request.query.access || "");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  if (!order || !token || hash.length !== order.accessTokenHash.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(order.accessTokenHash))) return response.status(404).render("404", { title: "Invoice not found — MacPoint", year: response.locals.year });
  const invoice = data.invoices.find((item) => item.orderId === order.id);
  if (!invoice) return response.status(404).render("404", { title: "Invoice not found — MacPoint", year: response.locals.year });
  response.render("invoice", { title: invoice.invoiceNumber + " — MacPoint", invoice, snapshot: invoice.data });
});

app.post(["/login", "/admin/login"], async (request, response, next) => {
  try {
    const adminMode = request.path === '/admin/login' || /^\/admin(?:\/|$)/.test(String(request.body.next || ''));
    const identity = String(request.body.identity || "").trim().toLowerCase();
    const phone = validPhone(identity);
    const user = identity && request.state.data.users.find((entry) => (entry.email || "").toLowerCase() === identity || (phone && entry.phone === phone));
    if (!user || user.status === "inactive" || (adminMode && user.userType !== 'admin') || !(await passwordMatches(request.body.password, user.passwordHash))) {
      return response.status(401).render("login", { title: adminMode ? 'Admin sign in — MacPoint' : 'Sign in — MacPoint', adminMode, identity, next: request.body.next || '', message: adminMode ? 'The email or password does not match an active administrator. Please try again.' : 'Those details did not match an active account.', setupAvailable: !requestHasAdmin(request) });
    }
    const session = createSession(user.id);
    setSessionCookie(response, session.id, session.secret);
    response.redirect(safeLoginDestination(request.body.next, user));
  } catch (error) { next(error); }
});

app.get("/register", (_request, response) => response.render("register", { title: "Create account — MacPoint", message: "" }));
app.post("/register", async (request, response, next) => {
  try {
    const name = String(request.body.name || "").trim().slice(0, 120);
    const phone = validPhone(request.body.phone);
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    if (!name || !phone || password.length < 8) return response.status(400).render("register", { title: "Create account — MacPoint", message: "Enter your name, a valid mobile number, and a password with at least 8 characters." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).render("register", { title: "Create account — MacPoint", message: "Enter a valid email address." });
    const duplicate = request.state.data.users.some((user) => user.phone === phone || (email && user.email.toLowerCase() === email));
    if (duplicate) return response.status(409).render("register", { title: "Create account — MacPoint", message: "An account already uses that phone number or email." });
    const user = { id: makeId("customer"), name, phone, email, passwordHash: await passwordHash(password), userType: "customer", status: "active", createdAt: new Date().toISOString() };
    store.update((data) => data.users.push(user));
    const session = createSession(user.id);
    setSessionCookie(response, session.id, session.secret);
    response.redirect("/account");
  } catch (error) { next(error); }
});

app.post("/logout", (request, response) => {
  if (request.state.user) realtime?.logout(request.state.user.id);
  if (request.state.session) store.update((data) => { data.sessions = data.sessions.filter((session) => session.id !== request.state.session.id); });
  clearSessionCookie(response);
  response.redirect("/");
});

app.get("/account", requireCustomer, (request, response) => {
  const data = request.state.data;
  const orders = data.orders.filter((order) => order.userId === request.state.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const invoices = data.invoices.filter((invoice) => invoice.userId === request.state.user.id);
  response.render("account", { title: "Your account — MacPoint", orders, invoices, addresses: data.addresses.filter((address) => address.userId === request.state.user.id), totalSpent: orders.filter((order) => order.orderStatus !== "cancelled").reduce((sum, order) => sum + order.total, 0), section: "overview" });
});

app.get("/account/addresses", requireCustomer, (request, response) => {
  response.render("account", { title: "Your addresses — MacPoint", orders: [], invoices: [], addresses: request.state.data.addresses.filter((address) => address.userId === request.state.user.id), totalSpent: 0, section: "addresses" });
});

app.post("/account/addresses", requireCustomer, (request, response) => {
  const name = String(request.body.name || "").trim();
  const phone = validPhone(request.body.phone);
  const address = String(request.body.address || "").trim();
  const city = String(request.body.city || "").trim();
  const zone = request.body.zone === "dhaka" ? "dhaka" : "outside_dhaka";
  if (!name || !phone || !address || !city) { setFlash(response, "error", "Complete every address field with a valid phone number."); return response.redirect("/account/addresses"); }
  store.update((data) => {
    if (request.body.isDefault === "on") data.addresses.filter((item) => item.userId === request.state.user.id).forEach((item) => { item.isDefault = false; });
    data.addresses.push({ id: makeId("address"), userId: request.state.user.id, label: String(request.body.label || "Home").slice(0, 60), name, phone, address, city, zone, isDefault: request.body.isDefault === "on" || !data.addresses.some((item) => item.userId === request.state.user.id), createdAt: new Date().toISOString() });
  });
  response.redirect("/account/addresses");
});

app.post("/account/addresses/:id/default", requireCustomer, (request, response) => {
  store.update((data) => data.addresses.filter((item) => item.userId === request.state.user.id).forEach((item) => { item.isDefault = item.id === request.params.id; }));
  response.redirect("/account/addresses");
});

app.post("/account/profile", requireCustomer, async (request, response, next) => {
  try {
    const name = String(request.body.name || "").trim().slice(0, 120);
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    if (!name || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { setFlash(response, "error", "Enter a name and a valid email address."); return response.redirect("/account"); }
    let nextPasswordHash;
    if (password) {
      if (password.length < 8) throw new Error("Use at least 8 characters for a new password.");
      nextPasswordHash = await passwordHash(password);
    }
    store.update((data) => {
      const user = data.users.find((entry) => entry.id === request.state.user.id);
      user.name = name; user.email = email;
      if (nextPasswordHash) user.passwordHash = nextPasswordHash;
    });
    response.redirect("/account");
  } catch (error) { setFlash(response, "error", error.message); response.redirect("/account"); }
});

app.get("/account/orders/:id", requireCustomer, (request, response) => {
  const data = request.state.data;
  const order = data.orders.find((item) => item.id === request.params.id && item.userId === request.state.user.id);
  if (!order) return response.status(404).render("404", { title: "Order not found — MacPoint", year: response.locals.year });
  response.render("account-order", { title: "Order details — MacPoint", order, invoiceId: data.invoices.find((item) => item.orderId === order.id)?.id || "" });
});

app.get("/account/invoices/:id", requireCustomer, (request, response) => {
  const data = request.state.data;
  const invoice = data.invoices.find((item) => item.id === request.params.id && item.userId === request.state.user.id);
  if (!invoice) return response.status(404).render("404", { title: "Invoice not found — MacPoint", year: response.locals.year });
  response.render("invoice", { title: `${invoice.invoiceNumber} — MacPoint`, invoice, snapshot: invoice.data });
});

app.post("/api/newsletter", (request, response) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: "Enter a valid email address." });
  store.update((data) => { if (!data.subscribers.some((item) => item.email === email)) data.subscribers.push({ id: makeId("subscriber"), email, createdAt: new Date().toISOString() }); });
  response.json({ message: "You’re on the list. We’ll be in touch when there’s something worth sharing." });
});

app.get("/api/wishlist", (request, response) => {
  if (request.state.user?.userType !== "customer") return response.json({ productIds: [] });
  const saved = request.state.data.wishlists.find((item) => item.userId === request.state.user.id);
  response.json({ productIds: saved?.productIds || [] });
});

app.post("/api/wishlist", requireCustomer, (request, response) => {
  const productIds = [...new Set((Array.isArray(request.body.productIds) ? request.body.productIds : []).map(String).filter((id) => request.state.data.products.some((product) => product.id === id && product.active)))].slice(0, 300);
  store.update((data) => {
    let saved = data.wishlists.find((item) => item.userId === request.state.user.id);
    if (!saved) { saved = { userId: request.state.user.id, productIds: [] }; data.wishlists.push(saved); }
    saved.productIds = productIds;
  });
  response.json({ productIds });
});

app.get("/account/wishlist", requireCustomer, (request, response) => {
  const data = request.state.data;
  const saved = data.wishlists.find((item) => item.userId === request.state.user.id);
  const products = activeProducts(data).filter((product) => saved?.productIds.includes(product.id)).map(publicProduct);
  response.render("account", { title: "Your wishlist — MacPoint", orders: [], invoices: [], addresses: [], totalSpent: 0, section: "wishlist", wishlistProducts: products });
});

app.post("/api/chat/conversations", (request, response) => {
  const data = request.state.data;
  const visitorKey = String(request.body.visitorKey || "").slice(0, 100);
  const phone = validPhone(request.body.phone);
  const name = String(request.body.name || "").trim().slice(0, 120);
  if (!visitorKey || !phone || !name) return response.status(400).json({ error: "Enter your name and a valid mobile number to start a conversation." });
  let conversation = data.conversations.find((item) => item.visitorKey === visitorKey && item.status === "open");
  if (!conversation) {
    conversation = { id: makeId("conversation"), visitorKey, userId: request.state.user?.id || null, name, phone, status: "open", lastMessage: "", unreadAdmin: 0, unreadCustomer: 0, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(), customerOnlineAt: new Date().toISOString() };
    data.conversations.push(conversation);
    store.write(data);
    realtime?.conversation(conversation);
  }
  response.json({ conversation: { id: conversation.id, name: conversation.name, phone: conversation.phone, status: conversation.status } });
});

app.get("/api/chat/messages", (request, response) => {
  const data = request.state.data;
  const conversation = data.conversations.find((item) => item.id === request.query.conversationId && (item.visitorKey === request.query.visitorKey || (request.state.user && item.userId === request.state.user.id)));
  if (!conversation) return response.status(404).json({ error: "Conversation not found." });
  conversation.customerOnlineAt = new Date().toISOString();
  const after = Number(request.query.after || 0);
  const messages = data.messages.filter((message) => message.conversationId === conversation.id && new Date(message.createdAt).getTime() > after);
  conversation.unreadCustomer = 0;
  store.write(data);
  response.json({ messages, conversation: { id: conversation.id, status: conversation.status } });
});

app.post("/api/chat/messages", (request, response) => {
  const data = request.state.data;
  const conversation = data.conversations.find((item) => item.id === request.body.conversationId && (item.visitorKey === request.body.visitorKey || (request.state.user && item.userId === request.state.user.id)));
  const body = String(request.body.message || "").trim().slice(0, 2000);
  if (!conversation || !body) return response.status(400).json({ error: "Write a message to continue." });
  const message = { id: makeId("message"), conversationId: conversation.id, senderId: request.state.user?.id || null, senderType: "customer", message: body, isRead: false, createdAt: new Date().toISOString() };
  data.messages.push(message); conversation.lastMessage = body; conversation.lastMessageAt = message.createdAt; conversation.customerOnlineAt = message.createdAt; conversation.unreadAdmin += 1;
  store.write(data);
  realtime?.publish(message);
  response.status(201).json({ message });
});

app.get("/admin/setup", (_request, response) => {
  if (requestHasAdmin(_request)) return response.redirect("/admin/login");
  response.render("admin-setup", { title: "Set up MacPoint admin — MacPoint", message: "" });
});

function requestHasAdmin(request) { return request.state.data.users.some((user) => user.userType === "admin"); }

app.post("/admin/setup", async (request, response, next) => {
  try {
    if (requestHasAdmin(request)) return response.status(403).render("error", { title: "Setup is closed — MacPoint", message: "An administrator account already exists." });
    const name = String(request.body.name || "").trim().slice(0, 120);
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    if (request.body.confirmPassword !== undefined && password !== String(request.body.confirmPassword)) return response.status(400).render('admin-setup', { title: 'Set up MacPoint admin — MacPoint', message: 'The passwords do not match. Please enter them again.' });
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) return response.status(400).render("admin-setup", { title: "Set up MacPoint admin — MacPoint", message: "Enter a name, valid email, and password with at least 12 characters." });
    const user = { id: makeId("admin"), name, email, phone: "", passwordHash: await passwordHash(password), userType: "admin", role: "Super Admin", status: "active", createdAt: new Date().toISOString() };
    store.update((data) => {
      if (data.users.some(entry => entry.userType === 'admin')) { const error = new Error('An administrator account already exists. Sign in to continue.'); error.status = 409; throw error; }
      if (data.users.some(entry => entry.email?.toLowerCase() === email)) { const error = new Error('That email already belongs to an account. Use another administrator email.'); error.status = 409; throw error; }
      data.users.push(user);
    });
    const session = createSession(user.id); setSessionCookie(response, session.id, session.secret);
    response.redirect("/admin");
  } catch (error) { next(error); }
});

app.get("/admin", requireAdmin, requirePermission("dashboard"), (request, response) => {
  const data = request.state.data;
  const activeOrders = data.orders.filter((order) => order.orderStatus !== "cancelled");
  const metrics = {
    revenue: activeOrders.reduce((sum, order) => sum + order.total, 0),
    orders: data.orders.length,
    pending: data.orders.filter((order) => order.orderStatus === "pending").length,
    products: activeProducts(data).length,
    lowStock: activeProducts(data).filter((product) => product.stock <= product.lowStockThreshold).length,
    customers: data.users.filter((user) => user.userType === "customer").length,
  };
  response.render("admin", { title: "Admin dashboard — MacPoint", section: "dashboard", data, metrics, recentOrders: [...data.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), topProducts: [...data.products].sort((a, b) => b.totalSold - a.totalSold).slice(0, 6), notifications: [...data.notifications].slice(0, 8), rolePermissions });
});

const adminSectionPermission = { orders: "orders", products: "products", categories: "categories", inventory: "inventory", customers: "customers", coupons: "coupons", settings: "settings", chat: "chat", users: "users", banners: "banners" };

app.get("/admin/:section", requireAdmin, (request, response, next) => {
  const section = request.params.section;
  if (!adminSectionPermission[section]) return next();
  if (!hasPermission(request.state.user, adminSectionPermission[section])) return response.status(403).render("error", { title: "Access denied — MacPoint", message: "Your account does not have permission to open this area." });
  const data = request.state.data;
  const search = String(request.query.q || "").trim().toLowerCase();
  let sectionData = {};
  sectionData.search = search;
  sectionData.queryStatus = request.query.status || "all";
  if (section === "orders") {
    const filter = request.query.status || "all";
    sectionData.orders = [...data.orders].filter((order) => (filter === "all" || order.orderStatus === filter) && (!search || `${order.orderNumber} ${order.shippingName} ${order.shippingPhone}`.toLowerCase().includes(search))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sectionData.counts = Object.fromEntries(["all", ...fulfillmentStatuses].map((status) => [status, status === "all" ? data.orders.length : data.orders.filter((order) => order.orderStatus === status).length]));
    sectionData.statuses = fulfillmentStatuses; sectionData.payments = paymentStatuses;
  }
  if (section === "products") {
    sectionData.products = data.products;
    sectionData.categories = data.categories;
    sectionData.editProduct = data.products.find((product) => product.id === request.query.edit) || null;
  }
  if (section === "categories") {
    sectionData.categories = data.categories.map((category) => ({ ...category, productCount: data.products.filter((product) => product.category === category.name && product.active).length }));
    sectionData.editCategory = data.categories.find((category) => category.id === request.query.edit) || null;
  }
  if (section === "inventory") { sectionData.products = activeProducts(data); sectionData.lowOnly = request.query.low === "1"; sectionData.logs = [...data.inventoryLogs].slice(-30).reverse(); }
  if (section === "customers") sectionData.customers = data.users.filter((user) => user.userType === "customer").map((user) => { const orders = data.orders.filter((order) => order.userId === user.id); return { ...safeUser(user), createdAt: user.createdAt, orderCount: orders.length, totalSpent: orders.filter((order) => order.orderStatus !== "cancelled").reduce((sum, order) => sum + order.total, 0) }; });
  if (section === "coupons") { sectionData.coupons = data.coupons; sectionData.editCoupon = data.coupons.find((coupon) => coupon.id === request.query.edit) || null; }
  if (section === "settings") sectionData.settings = data.settings;
  if (section === "banners") { sectionData.banners = data.banners || []; sectionData.editBanner = sectionData.banners.find((banner) => banner.id === request.query.edit) || null; }
  if (section === "users") sectionData.users = data.users.filter((user) => user.userType === "admin").map(safeUser);
  if (section === "chat") {
    sectionData.conversations = [...data.conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    sectionData.activeConversation = data.conversations.find((item) => item.id === request.query.id) || sectionData.conversations[0] || null;
    sectionData.messages = sectionData.activeConversation ? data.messages.filter((item) => item.conversationId === sectionData.activeConversation.id) : [];
    sectionData.customerOrders = sectionData.activeConversation ? data.orders.filter((item) => item.userId === sectionData.activeConversation.userId || item.shippingPhone === sectionData.activeConversation.phone) : [];
    if (sectionData.activeConversation) sectionData.activeConversation.unreadAdmin = 0;
  }
  response.render("admin", { title: `${section[0].toUpperCase()}${section.slice(1)} — MacPoint admin`, section, data, rolePermissions, ...sectionData });
});

app.get("/admin/orders/:id", requireAdmin, requirePermission("orders"), (request, response) => {
  const order = request.state.data.orders.find((item) => item.id === request.params.id);
  if (!order) return response.status(404).render("404", { title: "Order not found — MacPoint", year: response.locals.year });
  response.render("admin", { title: "Order detail — MacPoint admin", section: "order-detail", order: { ...order, invoiceId: request.state.data.invoices.find((item) => item.orderId === order.id)?.id || "" }, statuses: fulfillmentStatuses, payments: paymentStatuses, data: request.state.data, rolePermissions });
});

app.get("/admin/orders/:id/invoice", requireAdmin, requirePermission("orders"), (request, response) => {
  const invoice = request.state.data.invoices.find((item) => item.orderId === request.params.id);
  if (!invoice) return response.status(404).render("404", { title: "Invoice not found — MacPoint", year: response.locals.year });
  response.render("invoice", { title: invoice.invoiceNumber + " — MacPoint", invoice, snapshot: invoice.data });
});

app.post("/admin/orders/:id/status", requireAdmin, requirePermission("orders"), (request, response) => {
  const data = request.state.data;
  const order = data.orders.find((item) => item.id === request.params.id);
  const nextStatus = request.body.orderStatus;
  const paymentStatus = request.body.paymentStatus;
  if (!order || !fulfillmentStatuses.includes(nextStatus) || !paymentStatuses.includes(paymentStatus)) { setFlash(response, "error", "Choose a valid order and payment status."); return response.redirect(`/admin/orders/${request.params.id}`); }
  const progress = fulfillmentStatuses.slice(0, 7);
  const fromStep = progress.indexOf(order.orderStatus);
  const toStep = progress.indexOf(nextStatus);
  const permitted = order.orderStatus === nextStatus
    || (fromStep >= 0 && toStep > fromStep)
    || (nextStatus === 'cancelled' && fromStep >= 0 && fromStep < 4)
    || (nextStatus === 'returned' && fromStep >= 4)
    || (nextStatus === 'refunded' && order.orderStatus === 'returned')
    || (order.orderStatus === 'cancelled' && toStep >= 0 && toStep < 4);
  if (!permitted) { setFlash(response, 'error', 'That status change is not available. Dispatched orders must be returned before a refund.'); return response.redirect(`/admin/orders/${order.id}`); }
  if (["shipped", "out_for_delivery", "delivered"].includes(order.orderStatus) && nextStatus === "cancelled") { setFlash(response, "error", "Orders with a courier cannot be cancelled. Mark the parcel returned after it comes back."); return response.redirect(`/admin/orders/${order.id}`); }
  if (order.orderStatus !== nextStatus) {
    if (["cancelled", "returned"].includes(nextStatus) && order.stockReserved) {
      for (const item of order.items) {
        const product = data.products.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        if (product && variant) { variant.stock += item.quantity; variant.soldCount = Math.max(0, Number(variant.soldCount || 0) - item.quantity); product.stock = product.variants.reduce((sum, entry) => sum + Number(entry.stock || 0), 0); product.totalSold = Math.max(0, Number(product.totalSold || 0) - item.quantity); }
      }
      order.stockReserved = false;
    }
    if (order.orderStatus === "cancelled" && nextStatus !== "cancelled" && !order.stockReserved) {
      for (const item of order.items) {
        const product = data.products.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        if (!product || !variant || variant.stock < item.quantity) { setFlash(response, "error", `Not enough stock to reopen ${item.productName} (${item.variantName}).`); return response.redirect(`/admin/orders/${order.id}`); }
      }
      for (const item of order.items) {
        const product = data.products.find((entry) => entry.id === item.productId);
        const variant = product.variants.find((entry) => entry.id === item.variantId);
        variant.stock -= item.quantity; variant.soldCount = Number(variant.soldCount || 0) + item.quantity; product.stock = product.variants.reduce((sum, entry) => sum + Number(entry.stock || 0), 0); product.totalSold = Number(product.totalSold || 0) + item.quantity;
      }
      order.stockReserved = true;
    }
    order.timeline.push({ status: nextStatus, note: String(request.body.note || "").trim().slice(0, 1000) || `Order status changed to ${fulfillmentLabels[nextStatus]}.`, adminId: request.state.user.id, createdAt: new Date().toISOString() });
    order.orderStatus = nextStatus;
  }
  if (order.paymentStatus !== paymentStatus || (request.body.note && order.orderStatus === nextStatus && order.timeline.at(-1)?.note !== String(request.body.note).trim())) {
    order.timeline.push({ status: nextStatus, note: String(request.body.note || '').trim().slice(0, 1000) || `Payment status updated to ${paymentStatus.replaceAll('_', ' ')}.`, adminId: request.state.user.id, createdAt: new Date().toISOString() });
  }
  order.paymentStatus = paymentStatus;
  store.write(data);
  response.redirect(`/admin/orders/${order.id}`);
});

app.post("/admin/products/save", requireAdmin, requirePermission("products"), (request, response) => {
  const data = request.state.data;
  const id = String(request.body.id || "").trim();
  const name = String(request.body.name || "").trim().slice(0, 180);
  const category = data.categories.find((item) => item.id === request.body.categoryId);
  const price = Number(request.body.price);
  const stock = Math.max(0, Number.parseInt(request.body.stock, 10) || 0);
  if (!name || !category || !Number.isFinite(price) || price <= 0) { setFlash(response, "error", "Enter a product name, category, and valid price."); return response.redirect("/admin/products"); }
  let product = id ? data.products.find((item) => item.id === id) : null;
  if (id && !product) { setFlash(response, "error", "That product could not be found."); return response.redirect("/admin/products"); }
  const productId = product?.id || slugify(name) || makeId("product");
  const asArray = (value) => Array.isArray(value) ? value : value === undefined ? [] : [value];
  const variants = asArray(request.body.variantName);
  const variantIds = asArray(request.body.variantId);
  const variantColors = asArray(request.body.variantColor);
  const variantStocks = asArray(request.body.variantStock);
  const variantPrices = asArray(request.body.variantPrice);
  const variantNames = variants.map((variantName, index) => ({
    id: variantIds[index] || `${productId}-${slugify(variantName) || "option"}-${slugify(variantColors[index]) || index}`,
    name: String(variantName).trim().slice(0, 80), color: String(variantColors[index] || "").trim().slice(0, 80),
    sku: `${String(request.body.sku || `MP-${productId}`).trim()}-${slugify(variantName).toUpperCase()}${variantColors[index] ? `-${slugify(variantColors[index]).toUpperCase()}` : ""}`,
    price: Number(variantPrices[index]) > 0 ? Number(variantPrices[index]) : null,
    stock: Math.max(0, Number.parseInt(variantStocks[index], 10) || 0), soldCount: Number(product?.variants?.find((entry) => entry.id === variantIds[index])?.soldCount || 0), active: true,
  })).filter((variant) => variant.name);
  const imageValues = (Array.isArray(request.body.images) ? request.body.images : [request.body.images || request.body.image]).filter(Boolean).slice(0, 8);
  const images = imageValues.map((url, index) => ({ url: String(url), alt: `${name} ${index ? `view ${index + 1}` : ""}`.trim(), primary: index === 0, sortOrder: index }));
  product = {
    ...(product || {}), id: productId, slug: slugify(request.body.slug || name), name, category: category.name, createdAt: product?.createdAt || new Date().toISOString(),
    description: String(request.body.description || "").trim().slice(0, 1200), price, salePrice: Number(request.body.salePrice) > 0 ? Number(request.body.salePrice) : null,
    sku: String(request.body.sku || `MP-${productId}`).trim().slice(0, 80), stock: variantNames.length ? variantNames.reduce((sum, variant) => sum + variant.stock, 0) : stock,
    lowStockThreshold: Math.max(0, Number.parseInt(request.body.lowStockThreshold, 10) || 4), active: request.body.active === "on",
    featured: request.body.featured === "on", newArrival: request.body.newArrival === "on", bestSeller: request.body.bestSeller === "on",
    tags: String(request.body.tags || category.name).split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    variants: variantNames.length ? variantNames : (product?.variants || [{ id: `${productId}-base`, name: "Standard", color: "", sku: `MP-${productId}-STD`, price: null, stock, active: true }]),
    images: images.length ? images : (product?.images || []), image: images[0]?.url || product?.image || "", alt: name,
    badge: request.body.badge || (request.body.bestSeller === "on" ? "Bestseller" : request.body.newArrival === "on" ? "New" : "MacPoint pick"),
    totalSold: Number(product?.totalSold || 0),
  };
  const existingIndex = data.products.findIndex((item) => item.id === product.id);
  if (existingIndex >= 0) data.products[existingIndex] = product; else data.products.push(product);
  store.write(data); setFlash(response, "success", `${name} saved.`); response.redirect("/admin/products");
});

app.post("/admin/products/:id/delete", requireAdmin, requirePermission("products"), (request, response) => {
  store.update((data) => {
    const product = data.products.find((item) => item.id === request.params.id);
    if (!product) return;
    const hasHistory = data.orders.some((order) => order.items.some((item) => item.productId === product.id));
    if (hasHistory) product.active = false;
    else data.products = data.products.filter((item) => item.id !== product.id);
  });
  setFlash(response, "success", "Product removed from the active catalog."); response.redirect("/admin/products");
});

app.post("/admin/categories/save", requireAdmin, requirePermission("categories"), (request, response) => {
  const name = String(request.body.name || "").trim().slice(0, 100);
  if (!name) { setFlash(response, "error", "Enter a category name."); return response.redirect("/admin/categories"); }
  store.update((data) => {
    const category = data.categories.find((item) => item.id === request.body.id);
    const fields = { name, slug: slugify(request.body.slug || name), description: String(request.body.description || "").trim().slice(0, 500), image: String(request.body.image || "").trim(), sortOrder: Number(request.body.sortOrder) || 0, showInSidebar: request.body.showInSidebar === "on", showInHeader: request.body.showInHeader === "on", showOnHomepage: request.body.showOnHomepage === "on", active: request.body.active === "on" };
    if (category) {
      const previousName = category.name;
      Object.assign(category, fields);
      if (previousName !== name) data.products.filter((product) => product.category === previousName).forEach((product) => { product.category = name; });
    }
    else data.categories.push({ id: makeId("category"), ...fields });
  });
  setFlash(response, "success", "Category saved."); response.redirect("/admin/categories");
});

app.post("/admin/categories/:id/toggle", requireAdmin, requirePermission("categories"), (request, response) => {
  const key = ["showInSidebar", "showInHeader", "showOnHomepage", "active"].includes(request.body.key) ? request.body.key : "active";
  store.update((data) => { const category = data.categories.find((item) => item.id === request.params.id); if (category) category[key] = !category[key]; });
  response.redirect("/admin/categories");
});

app.post("/admin/inventory/adjust", requireAdmin, requirePermission("inventory"), (request, response) => {
  const delta = Math.trunc(Number(request.body.delta));
  const data = request.state.data;
  const product = data.products.find((item) => item.id === request.body.productId && item.active);
  const variant = product?.variants.find((item) => item.id === request.body.variantId && item.active);
  if (!product || !variant || !Number.isInteger(delta) || delta === 0 || delta < -10000 || delta > 10000 || variant.stock + delta < 0) { setFlash(response, "error", "That stock adjustment cannot be applied."); return response.redirect("/admin/inventory"); }
  const previousStock = variant.stock; variant.stock += delta; product.stock = product.variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  data.inventoryLogs.push({ id: makeId("inventory"), productId: product.id, variantId: variant.id, adjustment: delta, previousStock, newStock: variant.stock, reason: String(request.body.reason || "Manual admin adjustment").slice(0, 180), adminId: request.state.user.id, createdAt: new Date().toISOString() });
  store.write(data); setFlash(response, "success", "Stock updated and logged."); response.redirect("/admin/inventory");
});

app.post("/admin/coupons/save", requireAdmin, requirePermission("coupons"), (request, response) => {
  const code = String(request.body.code || "").trim().replace(/\s+/g, "").toUpperCase();
  const type = request.body.type === "percentage" ? "percentage" : "fixed";
  const value = Number(request.body.value);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !Number.isFinite(value) || value <= 0 || (type === "percentage" && value > 100)) { setFlash(response, "error", "Use a 3–32 character code and a valid discount value (up to 100% for percentage codes)."); return response.redirect("/admin/coupons"); }
  store.update((data) => {
    const current = data.coupons.find((coupon) => coupon.id === request.body.id || coupon.code === code);
    const fields = { code, type, value, minOrderAmount: Math.max(0, Number(request.body.minOrderAmount) || 0), maxDiscount: Math.max(0, Number(request.body.maxDiscount) || 0), expiryDate: request.body.expiryDate || "", usageLimit: Math.max(0, Number.parseInt(request.body.usageLimit, 10) || 0), active: request.body.active === "on" };
    if (current) Object.assign(current, fields); else data.coupons.push({ id: makeId("coupon"), ...fields, usedCount: 0 });
  });
  setFlash(response, "success", "Coupon saved."); response.redirect("/admin/coupons");
});

app.post("/admin/coupons/:id/toggle", requireAdmin, requirePermission("coupons"), (request, response) => {
  store.update((data) => { const coupon = data.coupons.find((item) => item.id === request.params.id); if (coupon) coupon.active = !coupon.active; });
  response.redirect("/admin/coupons");
});

app.post("/admin/settings/save", requireAdmin, requirePermission("settings"), (request, response) => {
  store.update((data) => {
    for (const key of ["storeName", "tagline", "hotline", "complaintsPhone", "supportEmail", "address", "logoUrl", "faviconUrl", "seoTitle", "seoDescription", "whatsapp"]) data.settings[key] = String(request.body[key] || "").trim().slice(0, 1000);
    for (const key of ["deliveryDhaka", "deliveryOutsideDhaka", "freeDeliveryThreshold"]) data.settings[key] = Math.max(0, Number(request.body[key]) || 0);
  });
  setFlash(response, "success", "Store and delivery settings saved."); response.redirect("/admin/settings");
});

app.post("/admin/banners/save", requireAdmin, requirePermission("banners"), (request, response) => {
  const data = request.state.data;
  const fields = {
    eyebrow: String(request.body.eyebrow || "").trim().slice(0, 100),
    title: String(request.body.title || "").trim().slice(0, 180),
    description: String(request.body.description || "").trim().slice(0, 500),
    note: String(request.body.note || "").trim().slice(0, 180),
    image: String(request.body.image || "").trim().slice(0, 2000000),
    alt: String(request.body.alt || "").trim().slice(0, 200),
    sortOrder: Number(request.body.sortOrder) || 0,
    active: request.body.active === "on",
  };
  if (!fields.title || !fields.image) { setFlash(response, "error", "A banner needs a title and an image URL."); return response.redirect("/admin/banners"); }
  const banner = data.banners.find((item) => item.id === request.body.id);
  if (banner) Object.assign(banner, fields);
  else data.banners.push({ id: makeId("banner"), ...fields });
  store.write(data); setFlash(response, "success", "Homepage banner saved."); response.redirect("/admin/banners");
});

app.post("/admin/banners/:id/toggle", requireAdmin, requirePermission("banners"), (request, response) => {
  store.update((data) => { const banner = data.banners.find((item) => item.id === request.params.id); if (banner) banner.active = !banner.active; });
  response.redirect("/admin/banners");
});

app.post("/admin/users/save", requireAdmin, requirePermission("users"), async (request, response, next) => {
  try {
    const name = String(request.body.name || "").trim(); const email = String(request.body.email || "").trim().toLowerCase(); const password = String(request.body.password || ""); const role = request.body.role;
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !rolePermissions[role] || (role === "Super Admin" && request.state.user.role !== "Super Admin") || password.length < 12) { setFlash(response, "error", "Enter a name, email, permitted role, and password with at least 12 characters."); return response.redirect("/admin/users"); }
    const exists = request.state.data.users.some((user) => user.email.toLowerCase() === email);
    if (exists) { setFlash(response, "error", "An account already uses that email address."); return response.redirect("/admin/users"); }
    const user = { id: makeId("admin"), name, email, phone: "", passwordHash: await passwordHash(password), userType: "admin", role, status: "active", createdAt: new Date().toISOString() };
    store.update((data) => data.users.push(user)); setFlash(response, "success", "Admin account created."); response.redirect("/admin/users");
  } catch (error) { next(error); }
});

app.get("/api/admin/chat/messages", requireAdmin, requirePermission("chat"), (request, response) => {
  const data = request.state.data;
  const conversation = data.conversations.find((item) => item.id === request.query.conversationId);
  if (!conversation) return response.status(404).json({ error: "Conversation not found." });
  const after = Number(request.query.after || 0);
  const messages = data.messages.filter((item) => item.conversationId === conversation.id && new Date(item.createdAt).getTime() > after);
  conversation.unreadAdmin = 0; store.write(data); response.json({ messages });
});

app.post("/api/admin/chat/messages", requireAdmin, requirePermission("chat"), (request, response) => {
  const data = request.state.data;
  const conversation = data.conversations.find((item) => item.id === request.body.conversationId);
  const messageText = String(request.body.message || "").trim().slice(0, 2000);
  if (!conversation || !messageText) return response.status(400).json({ error: "Write a message to continue." });
  const message = { id: makeId("message"), conversationId: conversation.id, senderId: request.state.user.id, senderType: "admin", message: messageText, isRead: false, createdAt: new Date().toISOString() };
  data.messages.push(message); conversation.lastMessage = messageText; conversation.lastMessageAt = message.createdAt; conversation.unreadCustomer += 1;
  store.write(data); realtime?.publish(message); response.status(201).json({ message });
});

app.post("/api/admin/upload", requireAdmin, requirePermission("products"), (request, response) => {
  const dataUri = String(request.body.dataUri || "");
  if (!/^data:image\/(jpeg|png|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(dataUri) || dataUri.length > 7_500_000) return response.status(400).json({ error: "Choose a JPEG, PNG, WebP, GIF, SVG, or AVIF image under 5 MB." });
  response.status(201).json({ url: dataUri });
});

app.use((_request, response) => response.status(404).render("404", { title: "Page not found — MacPoint", year: response.locals.year }));
app.use((error, _request, response, _next) => {
  console.error(error);
  if (response.headersSent) return;
  if (_request.path.startsWith('/api/')) return response.status(error.status || 500).json({ error: error.status === 409 ? error.message : 'This request could not be completed. Please try again.' });
  response.status(error.status || 500).render("error", { title: "Something went wrong — MacPoint", message: error.status === 409 || process.env.NODE_ENV !== "production" ? error.message : "Please try again in a moment.", year: response.locals.year });
});

if (require.main === module) httpServer.listen(port, () => console.log(`MacPoint is listening on http://localhost:${port}`));

module.exports = app;
