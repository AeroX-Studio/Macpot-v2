const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const roles = require('./roles');

// Relational ownership and stock constraints live in SQLite. Flexible product metadata
// and historical invoice snapshots are JSON, avoiding destructive catalog migrations.
module.exports = function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS roles (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS permissions (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS role_permissions (role TEXT REFERENCES roles(name), permission TEXT REFERENCES permissions(name), PRIMARY KEY(role,permission));
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, category_id TEXT REFERENCES categories(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), stock INTEGER GENERATED ALWAYS AS (json_extract(payload,'$.stock')) VIRTUAL CHECK(stock >= 0));
    CREATE TABLE IF NOT EXISTS product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), stock INTEGER GENERATED ALWAYS AS (json_extract(payload,'$.stock')) VIRTUAL CHECK(stock >= 0));
    CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT REFERENCES products(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS order_timeline (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS addresses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS wishlists (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL REFERENCES products(id), position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,position);
    CREATE INDEX IF NOT EXISTS orders_customer ON orders(user_id);
    CREATE INDEX IF NOT EXISTS variants_product ON product_variants(product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS product_slug ON products(json_extract(payload,'$.slug'));
    CREATE UNIQUE INDEX IF NOT EXISTS order_number ON orders(json_extract(payload,'$.orderNumber'));
  `);
  const simple = { coupons: 'coupons', inventoryLogs: 'inventory_logs', banners: 'banners', notifications: 'notifications', subscribers: 'subscribers' };
  for (const table of Object.values(simple)) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, position INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)))`);
  const entities = { users: 'users', categories: 'categories', products: 'products', orders: 'orders', invoices: 'invoices', addresses: 'addresses', sessions: 'sessions', conversations: 'conversations', messages: 'messages', ...simple };
  const statements = new Map();
  const statement = sql => { if (!statements.has(sql)) statements.set(sql, db.prepare(sql)); return statements.get(sql); };
  const rows = table => statement(`SELECT payload FROM ${table} ORDER BY position`).all().map(row => JSON.parse(row.payload));
  const revision = () => Number(statement("SELECT value FROM metadata WHERE key='revision'").get()?.value || 0);
  function read() {
    // Keep all tables at the same revision if another process commits mid-read.
    db.exec('BEGIN');
    try {
      const metadata = statement("SELECT value FROM metadata WHERE key='store'").get();
      if (!metadata) { db.exec('COMMIT'); return null; }
      const data = JSON.parse(metadata.value);
      for (const [key, table] of Object.entries(entities)) data[key] = rows(table);
      data.settings = Object.fromEntries(statement('SELECT key,value FROM settings').all().map(row => [row.key, JSON.parse(row.value)]));
      data.roles = statement('SELECT name FROM roles ORDER BY rowid').all().map(row => row.name);
      const related = (table, ownerColumn) => {
        const result = new Map();
        for (const row of statement(`SELECT ${ownerColumn} AS owner,payload FROM ${table} ORDER BY position`).all()) {
          if (!result.has(row.owner)) result.set(row.owner, []);
          result.get(row.owner).push(JSON.parse(row.payload));
        }
        return result;
      };
      const variants = related('product_variants', 'product_id');
      const images = related('product_images', 'product_id');
      data.products.forEach(product => { product.variants = variants.get(product.id) || []; product.images = images.get(product.id) || []; });
      const items = related('order_items', 'order_id');
      const timeline = related('order_timeline', 'order_id');
      data.orders.forEach(order => { order.items = items.get(order.id) || []; order.timeline = timeline.get(order.id) || []; });
      const wishlists = new Map();
      for (const row of statement('SELECT user_id,product_id FROM wishlists ORDER BY position').all()) {
        if (!wishlists.has(row.user_id)) wishlists.set(row.user_id, []);
        wishlists.get(row.user_id).push(row.product_id);
      }
      data.wishlists = [...wishlists].map(([userId, productIds]) => ({ userId, productIds }));
      Object.defineProperty(data, '_revision', { value: revision(), writable: true, configurable: true });
      db.exec('COMMIT');
      return data;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const insert = (table, fields) => {
    const keys = Object.keys(fields);
    statement(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(fields));
  };
  function write(data) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = revision();
      if ((data._revision ?? 0) !== current) {
        const error = new Error('The store changed while this request was being processed. Refresh and try again.');
        error.status = 409; throw error;
      }
      // Child-to-parent deletion and parent-to-child insertion stay within one commit.
      for (const table of ['wishlists', 'messages', 'conversations', 'sessions', 'addresses', 'invoices', 'order_timeline', 'order_items', 'orders', 'product_images', 'product_variants', 'products', 'categories', 'users', 'role_permissions', 'permissions', 'roles', 'settings', ...Object.values(simple)]) db.exec(`DELETE FROM ${table}`);
      for (const name of data.roles || Object.keys(roles)) insert('roles', { name });
      for (const name of [...new Set(Object.values(roles).flat())]) insert('permissions', { name });
      for (const [role, permissions] of Object.entries(roles)) for (const permission of permissions) insert('role_permissions', { role, permission });
      for (const [key, value] of Object.entries(data.settings)) insert('settings', { key, value: JSON.stringify(value) });
      for (const [key, table] of Object.entries(entities)) {
        (data[key] || []).forEach((record, position) => {
          const payload = { ...record };
          const fields = { id: String(record.id || record.email || position), position };
          if (key === 'products') { delete payload.variants; delete payload.images; fields.category_id = data.categories.find(category => category.name === record.category)?.id || null; }
          if (key === 'orders') { delete payload.items; delete payload.timeline; fields.user_id = record.userId; }
          if (['invoices', 'addresses', 'sessions', 'conversations'].includes(key)) fields.user_id = record.userId || null;
          if (key === 'invoices') fields.order_id = record.orderId;
          if (key === 'messages') fields.conversation_id = record.conversationId;
          insert(table, { ...fields, payload: JSON.stringify(payload) });
        });
      }
      data.products.forEach(product => {
        (product.variants || []).forEach((variant, position) => insert('product_variants', { id: variant.id, product_id: product.id, position, payload: JSON.stringify(variant) }));
        (product.images || []).forEach((image, position) => insert('product_images', { id: `${product.id}:${position}`, product_id: product.id, position, payload: JSON.stringify(image) }));
      });
      data.orders.forEach(order => {
        order.items.forEach((item, position) => insert('order_items', { id: `${order.id}:${position}`, order_id: order.id, product_id: data.products.some(p => p.id === item.productId) ? item.productId : null, position, payload: JSON.stringify(item) }));
        order.timeline.forEach((entry, position) => insert('order_timeline', { id: `${order.id}:${position}`, order_id: order.id, position, payload: JSON.stringify(entry) }));
      });
      let wishPosition = 0;
      for (const list of data.wishlists || []) for (const productId of list.productIds) {
        if (data.products.some(p => p.id === productId)) insert('wishlists', { id: `${list.userId}:${productId}`, user_id: list.userId, product_id: productId, position: wishPosition++ });
      }
      const metadata = { ...data };
      for (const key of [...Object.keys(entities), 'settings', 'roles', 'wishlists']) delete metadata[key];
      statement("INSERT INTO metadata(key,value) VALUES('store',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(metadata));
      statement("INSERT INTO metadata(key,value) VALUES('revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(current + 1));
      db.exec('COMMIT');
      Object.defineProperty(data, '_revision', { value: current + 1, writable: true, configurable: true });
      return data;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { read, write, close: () => db.close() };
};
