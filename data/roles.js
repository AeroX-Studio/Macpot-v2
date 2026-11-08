module.exports = {
  'Super Admin': ['*'],
  Manager: ['dashboard', 'orders', 'products', 'categories', 'inventory', 'customers', 'coupons', 'chat', 'settings', 'banners'],
  'Order Manager': ['dashboard', 'orders', 'customers'],
  'Product Manager': ['dashboard', 'products', 'categories'],
  'Customer Support': ['dashboard', 'orders', 'customers', 'chat'],
  'Inventory Manager': ['dashboard', 'products', 'inventory'],
};
