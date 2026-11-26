import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// eslint-disable-next-line import/no-default-export -- Playwright config
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  outputDir: "./test-results",
  retries: 0,
  reporter: [["list"]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `bun run vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
