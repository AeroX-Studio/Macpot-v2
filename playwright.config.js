const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3107', browserName: 'chromium', channel: 'chromium', screenshot: 'only-on-failure' },
});
