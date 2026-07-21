import { defineConfig, devices } from "@playwright/test";

import { BASE_URL } from "./support/env";

export default defineConfig({
  testDir: "./tests",

  // Per-slot output dir. Playwright CLEARS outputDir at run start, so concurrent
  // invocations sharing the default `test-results/` delete each other's traces
  // and error-context.md — a sibling wiped the only page snapshot for a
  // database-routing-admin failure mid-diagnosis. PW_SLOT_OFFSET already
  // partitions backends between concurrent invocations; reuse it here.
  outputDir: process.env.PW_SLOT_OFFSET
    ? `test-results-slot${process.env.PW_SLOT_OFFSET}`
    : "test-results",

  // The whole suite shares one backend, and restore() resets the entire app
  // DB, so tests must not interleave across workers. Per-worker backends are
  // the follow-up experiment; the spike stays serial like a Cypress shard.
  workers: 1,
  fullyParallel: false,

  timeout: 90_000,
  expect: { timeout: 10_000 },

  // CI-only backstop for a wedged shard. The per-test timeout above does not
  // bound the RUN: a shard can hang in a worker fixture or between tests and
  // then burn GitHub's 6h job limit, blocking the whole workflow. That happened
  // on shard 38 of run 29799291313 — 54/55 jobs finished, one sat in "Run
  // Playwright tests" for 44 min, and cancelling it cost that shard's ~97 test
  // results. A shard is ~15-20 min at workers=2 and longer at workers=1, so 50
  // min is generous headroom while still failing fast enough to be useful.
  // Unset locally: a --repeat-each sweep or a debugging session can legitimately
  // run long, and killing it would be worse than waiting.
  globalTimeout: process.env.CI ? 50 * 60_000 : undefined,

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
    // `||` not `??`: an empty env string must fall back too (Number("") is 0,
    // which Playwright treats as "no timeout").
    actionTimeout: Number(process.env.PW_ACTION_TIMEOUT) || 15_000,
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
      use: {
        ...devices["Desktop Chrome"],
        // AFTER the spread, deliberately. `devices["Desktop Chrome"]` carries
        // its own viewport of 1280x720, and project-level `use` overrides
        // top-level `use` — so the 1280x800 set above never took effect and the
        // harness has been running at 720 (FINDINGS #41/#111). Cypress runs
        // 1280x800, so this restores fidelity rather than changing it.
        //
        // Not cosmetic: at 720 the expression popover flips ABOVE its anchor
        // (measured y=26 vs y=402) and covers "Pick columns", which broke four
        // tests in a way that reads exactly like port drift. Any spec whose
        // layout depends on fold position has been running at the wrong size,
        // so a port that "fixed" such a failure locally may have encoded a
        // workaround for a harness defect — those become unnecessary or wrong
        // at 800 and need re-running.
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
