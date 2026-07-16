import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./support/env";

export default defineConfig({
  testDir: "./tests",

  // The whole suite shares one backend, and restore() resets the entire app
  // DB, so tests must not interleave across workers. Per-worker backends are
  // the follow-up experiment; the spike stays serial like a Cypress shard.
  workers: 1,
  fullyParallel: false,

  timeout: 90_000,
  expect: { timeout: 10_000 },

  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "target/junit/playwright.xml" }],
        // Per-test startTime/duration for timing comparisons vs Cypress
        // (its equivalents: timings.json spec durations + junit).
        ["json", { outputFile: "target/playwright-results.json" }],
        ["html", { open: "never" }],
      ]
    : [["list"]],

  globalTeardown: "./support/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    testIdAttribute: "data-testid",
    // PW_ACTION_TIMEOUT override: parallel JVM boots peg the CPU during the
    // per-worker experiment, so actions need more headroom there.
    actionTimeout: Number(process.env.PW_ACTION_TIMEOUT ?? 15_000),
    trace: "retain-on-failure",
    // Port of Cypress chromeWebSecurity: false — required so the backend's
    // CSP doesn't block hot-reload bundles served from localhost:8080.
    bypassCSP: true,
    // Mirrors the Cypress before:browser:launch flags.
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
