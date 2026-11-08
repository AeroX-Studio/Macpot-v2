const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let app;
let temporaryDirectory;
test.beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'macpoint-browser-'));
  process.env.MACPOINT_DATA_FILE = path.join(temporaryDirectory, 'store.json');
  app = require('../../server');
  await new Promise(resolve => app.httpServer.listen(3107, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  if (app) await new Promise(resolve => app.realtime.io.close(resolve));
  require('../../data/store').close();
  if (temporaryDirectory && temporaryDirectory.startsWith(path.join(os.tmpdir(), 'macpoint-browser-'))) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('search, merchandising, quick view, wishlist and persistent cart work together', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Less ordinary.');
  await page.getByRole('button', { name: 'Next collection' }).click();
  await expect(page.locator('#hero-cta')).toHaveAttribute('href', '/category/iphone');
  await page.locator('#site-search').fill('Mac');
  await expect(page.locator('.search-suggestion')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.locator('#product-filters [data-filter="Mac"]').click();
  await expect(page.locator('#product-grid .product-card')).toHaveCount(2);
  await page.locator('#merchandising-select').selectOption('bestSeller');
  await expect(page.locator('#product-grid .product-card')).toHaveCount(1);
  await page.locator('#product-grid .favorite-button').click();
  await expect(page.locator('#wishlist-count')).toHaveText('1');
  await page.locator('#product-grid .product-card').hover();
  await page.getByRole('button', { name: 'Quick view', exact: true }).click();
  await expect(page.locator('#quick-view')).toBeVisible();
  await page.locator('#quick-view-variant').selectOption('macbook-air-256');
  await expect(page.locator('.quick-view-price')).toContainText('152,900');
  await page.locator('[data-quick-add]').click();
  await page.reload();
  await page.locator('#cart-trigger').click();
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.locator('.cart-line')).toContainText('256 GB');
  await page.getByRole('button', { name: 'Close shopping bag' }).click();
  expect(errors).toEqual([]);
});

test('mobile navigation, support and checkout work without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  await page.locator('#mobile-menu').getByRole('link', { name: 'Mac', exact: true }).click();
  await expect(page).toHaveURL(/category\/mac/);
  await expect(page.locator('.shop-filter-panel')).not.toHaveAttribute('open', '');
  await page.locator('.shop-filter-panel > summary').click();
  await expect(page.locator('.filter-form')).toBeVisible();
  await page.locator('.shop-filter-panel > summary').click();
  await page.locator('[data-add="macbook-air"]').click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  await page.locator('#checkout-button').click();
  await expect(page.locator('#checkout-total')).toContainText('139,080');
  await page.locator('[name=zone][value=outside_dhaka]').check();
  await expect(page.locator('#checkout-total')).toContainText('139,150');
  await page.locator('[name=name]').first().fill('Browser Test Customer');
  await page.locator('[name=phone]').first().fill('01787654321');
  await page.locator('[name=city]').fill('Chattogram');
  await page.locator('[name=address]').fill('12 Test Road');
  await page.getByRole('button', { name: 'Place COD order' }).click();
  await expect(page).toHaveURL(/order-success\/MP-/);
  await expect(page.locator('main')).toContainText('139,150');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/help');
  await page.locator('#support').getByText('Product advice, warranty, and returns').click();
  await page.getByRole('button', { name: 'Talk to MacPoint' }).click();
  await expect(page.locator('#chat-panel')).toBeVisible();
});

test('mobile bottom navigation, saved items and narrow layouts stay usable', async ({ page }) => {
  test.setTimeout(60000);
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/shop', '/product/macbook-air', '/login', '/admin/login']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${route}`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.favorite-button').first().click();
  await expect(page.locator('[data-mobile-wishlist-count]')).toHaveText('1');
  await page.locator('[data-open-wishlist]').click();
  await expect(page.locator('#wishlist-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-open-wishlist]')).toBeFocused();
  await page.locator('[data-open-bag]').click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-toggle')).toBeFocused();
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('admin setup, sign-in errors, protected destinations and mobile navigation work', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/setup');
  await page.locator('#setup-name').fill('Browser Administrator');
  await page.locator('#setup-email').fill('browser-admin@example.test');
  await page.locator('#setup-password').fill('Browser-admin-12345');
  await page.locator('#confirm-password').fill('Browser-admin-12345');
  await page.getByRole('button', { name: 'Create administrator' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('h1')).toContainText('Browser');
  await page.getByRole('button', { name: 'Open admin navigation' }).click();
  await expect(page.locator('#admin-mobile-menu')).toBeVisible();
  await page.locator('#admin-mobile-nav').getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/admin', '/admin/products', '/admin/orders', '/admin/chat']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} ${width}`).toBe(true);
    }
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  await page.locator('#login-identity').fill('browser-admin@example.test');
  await page.locator('#login-password').fill('Incorrect-password');
  await page.getByRole('button', { name: 'Sign in to your store' }).click();
  await expect(page.getByRole('alert')).toContainText('email or password');
  await expect(page.locator('#login-identity')).toHaveValue('browser-admin@example.test');
  await page.locator('#login-password').fill('Browser-admin-12345');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in to your store' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page.goto('/admin/setup');
  await expect(page).toHaveURL(/\/admin$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/admin-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/admin/login');
  await page.screenshot({ path: 'artifacts/admin-login-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/admin-login-desktop.png', fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('reduced motion retains visible content and keyboard dialogs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.difference-section h2')).toBeVisible();
  await page.locator('#cart-trigger').click();
  await expect(page.locator('#cart-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cart-drawer')).not.toBeVisible();
  await expect(page.locator('#cart-trigger')).toBeFocused();
});
