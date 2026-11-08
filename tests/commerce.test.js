const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'macpoint-test-'));
process.env.MACPOINT_DATA_FILE = path.join(temporaryDirectory, 'store.json');
const app = require('../server');
const store = require('../data/store');
let base;
let adminCookie;
let createdOrder;
const shipping = { name: 'Test Customer', phone: '01712345678', address: '12 Test Street', city: 'Dhaka', zone: 'dhaka' };
const post = (url, body, cookie = '') => fetch(base + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
const once = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Timed out: ' + event)), 5000); socket.once(event, value => { clearTimeout(timer); resolve(value); }); });

before(async () => {
  await new Promise(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.httpServer.address().port}`;
  const response = await post('/admin/setup', { name: 'Test Admin', email: 'admin@example.test', password: 'Test-password-12345' });
  assert.equal(response.status, 302);
  adminCookie = response.headers.get('set-cookie').split(';')[0];
});
after(async () => {
  await new Promise(resolve => app.httpServer.close(resolve));
  store.close();
  assert.ok(temporaryDirectory.startsWith(path.join(os.tmpdir(), 'macpoint-test-')));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('all public and admin screens render, with assets and predictive search', async () => {
  for (const route of ['/', '/shop', '/category/mac', '/product/macbook-air', '/checkout', '/login', '/register', '/help', '/admin', '/admin/products', '/admin/orders', '/admin/inventory', '/admin/customers', '/admin/coupons', '/admin/categories', '/admin/settings', '/admin/banners', '/admin/users', '/admin/chat', '/js/socket.io.js']) {
    const response = await fetch(base + route, { headers: { cookie: adminCookie } });
    assert.equal(response.status, 200, route);
  }
  const result = await (await fetch(base + '/api/products/search?q=mac')).json();
  assert.ok(result.products.length > 0 && result.products.length <= 6);
  assert.ok(result.products.every(product => product.category === 'Mac'));
  const response = await fetch(base + '/admin/orders', { redirect: 'manual' });
  assert.equal(response.status, 302);
});

test('COD uses authoritative prices, reserves stock, snapshots invoices and protects order links', async () => {
  const original = store.read().products.find(product => product.id === 'macbook-air');
  const response = await post('/api/orders', { shipping, items: [{ productId: original.id, variantId: original.variants[0].id, quantity: 2, price: 1 }], subtotal: 1, total: 1 });
  assert.equal(response.status, 201);
  createdOrder = await response.json();
  const data = store.read();
  const order = data.orders.find(order => order.orderNumber === createdOrder.orderNumber);
  assert.equal(order.subtotal, original.price * 2);
  assert.equal(order.total, original.price * 2 + data.settings.deliveryDhaka);
  assert.equal(data.products.find(product => product.id === original.id).variants[0].stock, original.variants[0].stock - 2);
  assert.equal(data.invoices.find(invoice => invoice.orderId === order.id).data.order.total, order.total);
  assert.equal((await fetch(base + createdOrder.url)).status, 200);
  assert.equal((await fetch(base + '/order-success/' + order.orderNumber)).status, 404);
  assert.equal((await fetch(base + createdOrder.url.replace('?', '/invoice?'))).status, 200);
});

test('duplicate cart lines cannot oversell and failed orders leave stock unchanged', async () => {
  const data = store.read();
  const product = data.products.find(product => product.id === 'ipad-air');
  const line = { productId: product.id, variantId: product.variants[0].id, quantity: product.variants[0].stock };
  const response = await post('/api/orders', { shipping, items: [line, line] });
  assert.equal(response.status, 409);
  assert.deepEqual(store.read().products, data.products);
  assert.equal(store.read().orders.length, data.orders.length);
});

test('coupons enforce normalization, caps, expiration, minimum spend and usage limits', async () => {
  store.update(data => data.coupons.push({ id: 'test-coupon', code: 'WELCOME', active: true, type: 'percentage', value: 10, maxDiscount: 500, minOrderAmount: 10000, usageLimit: 1, usedCount: 0 }));
  const items = [{ productId: 'macbook-air', variantId: 'macbook-air-base', quantity: 1 }];
  const response = await post('/api/coupons/validate', { code: ' welcome ', items });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).discount, 500);
  assert.equal((await post('/api/coupons/validate', { code: 'WELCOME', items: [] })).status, 400);
  store.update(data => { data.coupons[0].usedCount = 1; });
  assert.equal((await post('/api/coupons/validate', { code: 'WELCOME', items })).status, 400);
  store.update(data => { data.coupons[0].usedCount = 0; data.coupons[0].expiryDate = '2000-01-01'; });
  assert.equal((await post('/api/coupons/validate', { code: 'WELCOME', items })).status, 400);
});

test('cancellation returns stock once and reopening reserves it again', async () => {
  let data = store.read();
  const order = data.orders[0];
  const beforeStock = data.products.find(p => p.id === 'macbook-air').variants[0].stock;
  const url = '/admin/orders/' + order.id + '/status';
  await post(url, { orderStatus: 'cancelled', paymentStatus: 'cancelled' }, adminCookie);
  assert.equal(store.read().products.find(p => p.id === 'macbook-air').variants[0].stock, beforeStock + 2);
  await post(url, { orderStatus: 'cancelled', paymentStatus: 'cancelled' }, adminCookie);
  assert.equal(store.read().products.find(p => p.id === 'macbook-air').variants[0].stock, beforeStock + 2);
  await post(url, { orderStatus: 'confirmed', paymentStatus: 'cod_confirmed' }, adminCookie);
  assert.equal(store.read().products.find(p => p.id === 'macbook-air').variants[0].stock, beforeStock);
  await post(url, { orderStatus: 'shipped', paymentStatus: 'cod_confirmed' }, adminCookie);
  await post(url, { orderStatus: 'cancelled', paymentStatus: 'cancelled' }, adminCookie);
  assert.equal(store.read().orders[0].orderStatus, 'shipped');
  await post(url, { orderStatus: 'pending', paymentStatus: 'pending' }, adminCookie);
  assert.equal(store.read().orders[0].orderStatus, 'shipped');
  await post(url, { orderStatus: 'returned', paymentStatus: 'failed' }, adminCookie);
  assert.equal(store.read().products.find(p => p.id === 'macbook-air').variants[0].stock, beforeStock + 2);
  await post(url, { orderStatus: 'refunded', paymentStatus: 'cancelled' }, adminCookie);
  assert.equal(store.read().products.find(p => p.id === 'macbook-air').variants[0].stock, beforeStock + 2);
});

test('support delivers messages and typing live, rejecting access to another visitor’s room', async () => {
  const visitorKey = 'test-visitor-secret';
  const response = await post('/api/chat/conversations', { visitorKey, name: shipping.name, phone: shipping.phone });
  const { conversation } = await response.json();
  const guest = io(base, { path: '/api/socketio', auth: { visitorKey }, autoConnect: false });
  const admin = io(base, { path: '/api/socketio', extraHeaders: { cookie: adminCookie }, autoConnect: false });
  const intruder = io(base, { path: '/api/socketio', auth: { visitorKey: 'other-visitor' }, autoConnect: false });
  try {
    const connections = [guest, admin, intruder].map(socket => { const promise = once(socket, 'connect'); socket.connect(); return promise; });
    await Promise.all(connections);
    const join = socket => new Promise(resolve => socket.emit('conversation:join', conversation.id, resolve));
    assert.equal((await join(guest)).ok, true);
    assert.equal((await join(admin)).ok, true);
    assert.ok((await join(intruder)).error);
    const incoming = once(guest, 'message:new');
    assert.equal((await post('/api/admin/chat/messages', { conversationId: conversation.id, message: 'Hello from support' }, adminCookie)).status, 201);
    assert.equal((await incoming).message, 'Hello from support');
    const typing = once(admin, 'typing:start'); guest.emit('typing:start');
    assert.equal((await typing).senderType, 'customer');
    const forbidden = await fetch(base + '/api/chat/messages?conversationId=' + conversation.id + '&visitorKey=other-visitor');
    assert.equal(forbidden.status, 404);
  } finally { guest.disconnect(); admin.disconnect(); intruder.disconnect(); }
});

test('SQLite rejects stale writes and rolls back invalid inventory atomically', () => {
  const old = store.read();
  store.update(data => { data.settings.tagline = 'A committed update'; });
  old.settings.tagline = 'Stale update';
  assert.throws(() => store.write(old), error => error.status === 409);
  assert.equal(store.read().settings.tagline, 'A committed update');
  const invalid = store.read();
  invalid.products[0].variants[0].stock = -1;
  invalid.settings.tagline = 'Must roll back';
  assert.throws(() => store.write(invalid), /CHECK constraint failed/);
  assert.equal(store.read().settings.tagline, 'A committed update');
  assert.ok(store.read().products[0].variants[0].stock >= 0);
});

test('SQLite survives reopening and imports legacy data without changing custom content', () => {
  const reopened = require('../data/database')(store.dataFile);
  try { assert.deepEqual(reopened.read().orders, store.read().orders); }
  finally { reopened.close(); }
  const legacyFile = path.join(temporaryDirectory, 'legacy.json');
  const legacy = store.read();
  legacy.banners[0].title = 'A custom store campaign';
  legacy.settings.deliveryDhaka = 0;
  fs.writeFileSync(legacyFile, JSON.stringify(legacy));
  const result = require('node:child_process').spawnSync(process.execPath, ['-e', "const store=require('./data/store'); const data=store.read(); console.log(JSON.stringify({title:data.banners[0].title,delivery:data.settings.deliveryDhaka,orders:data.orders.length})); store.close();"], { cwd: path.join(__dirname, '..'), env: { ...process.env, MACPOINT_DATA_FILE: legacyFile }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { title: 'A custom store campaign', delivery: 0, orders: legacy.orders.length });
  assert.equal(JSON.parse(fs.readFileSync(legacyFile)).banners[0].title, 'A custom store campaign');
});

test('customer registration, account pages, saved addresses and wishlist enforce ownership', async () => {
  const response = await post('/register', { name: 'Account Tester', phone: '01812345678', email: 'customer@example.test', password: 'Customer-test-123' });
  assert.equal(response.status, 302);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  for (const route of ['/account', '/account/addresses', '/account/wishlist']) assert.equal((await fetch(base + route, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/admin', { headers: { cookie }, redirect: 'manual' })).status, 302);
  await post('/api/wishlist', { productIds: ['macbook-air'] }, cookie);
  assert.deepEqual((await (await fetch(base + '/api/wishlist', { headers: { cookie } })).json()).productIds, ['macbook-air']);
  await post('/account/addresses', { ...shipping, label: 'Office', isDefault: 'on' }, cookie);
  const user = store.read().users.find(user => user.email === 'customer@example.test');
  assert.equal(store.read().addresses.find(address => address.userId === user.id).label, 'Office');
  assert.equal((await fetch(base + '/account/orders/' + store.read().orders[0].id, { headers: { cookie } })).status, 404);
});

test('admin sign-in routes by role, preserves destinations and revokes sessions on sign-out', async () => {
  const credentials = { identity: 'admin@example.test', password: 'Test-password-12345' };
  const protectedPage = await fetch(base + '/admin/products', { redirect: 'manual' });
  assert.equal(protectedPage.headers.get('location'), '/admin/login?next=%2Fadmin%2Fproducts');
  for (const [route, next, destination] of [
    ['/login', '', '/admin'], ['/admin/login', '/admin/products', '/admin/products'],
    ['/login', '/account', '/admin'], ['/admin/login', '//example.test', '/admin'],
    ['/admin/login', '/\\example.test', '/admin'], ['/admin/login', '/admin/login', '/admin'],
  ]) {
    const response = await post(route, { ...credentials, next });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + destination, { headers: { cookie } })).status, 200);
    await post('/logout', {}, cookie);
    assert.equal((await fetch(base + '/admin', { headers: { cookie }, redirect: 'manual' })).status, 302);
  }
  for (const body of [{ ...credentials, password: 'wrong-password' }, { identity: '', password: credentials.password }, { identity: 'customer@example.test', password: 'Customer-test-123' }]) {
    const response = await post('/admin/login', body);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await post('/admin/setup', { name: 'Second Admin', email: 'second@example.test', password: 'Test-password-23456' })).status, 403);
  assert.equal(store.read().users.filter(user => user.userType === 'admin').length, 1);
});

test('staff roles restrict both admin pages and direct updates', async () => {
  const response = await post('/admin/users/save', { name: 'Order Staff', email: 'orders@example.test', password: 'Order-staff-12345', role: 'Order Manager' }, adminCookie);
  assert.equal(response.status, 302);
  const login = await post('/admin/login', { identity: 'orders@example.test', password: 'Order-staff-12345' });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/admin/orders', { headers: { cookie } })).status, 200);
  assert.equal((await fetch(base + '/admin/settings', { headers: { cookie } })).status, 403);
  const before = store.read().settings;
  assert.equal((await post('/admin/settings/save', { storeName: 'Unauthorized change' }, cookie)).status, 403);
  assert.deepEqual(store.read().settings, before);
});
