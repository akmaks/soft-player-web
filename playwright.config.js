// UI tests in WebKit (Safari's engine) at iPhone widths. The app is served as plain static files.
const { defineConfig, devices } = require('@playwright/test')
module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:8099/' },
  webServer: { command: 'python3 -m http.server 8099 2>/dev/null', url: 'http://localhost:8099/', reuseExistingServer: true },
  projects: [
    { name: 'iPhone 13 mini', use: { ...devices['iPhone 13 Mini'] } },
    { name: 'iPhone 320 (Display Zoom)', use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } } },
  ],
})
