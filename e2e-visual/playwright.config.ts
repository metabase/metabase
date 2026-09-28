import path from "node:path";

import { defineConfig } from "@playwright/test";

import { OUTPUT_DIR, SNAPSHOT_DIR, STORYBOOK_STATIC_DIR } from "./paths";
import {
  STATIC_SERVER_PORT,
  STORYBOOK_URL,
  usesExternalStorybook,
} from "./storybook";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: __dirname,
  testMatch: "stories.spec.ts",
  outputDir: OUTPUT_DIR,
  snapshotDir: SNAPSHOT_DIR,
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",

  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: getWorkers(),
  timeout: 60_000,

  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(__dirname, "report"), open: "never" }],
    ["json", { outputFile: path.join(OUTPUT_DIR, "results.json") }],
  ],

  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // Starting values: tune them against a stress run on CI before relying on them.
      threshold: 0.2,
      maxDiffPixelRatio: 0,
    },
  },

  use: {
    baseURL: STORYBOOK_URL,
    browserName: "chromium",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    launchOptions: {
      // Headless Chromium hides scrollbars by default, and overflowing stories should show them.
      ignoreDefaultArgs: ["--hide-scrollbars"],
    },
  },

  webServer: usesExternalStorybook
    ? undefined
    : {
        command: `node ${JSON.stringify(path.join(__dirname, "static-server.mjs"))} ${JSON.stringify(STORYBOOK_STATIC_DIR)} ${STATIC_SERVER_PORT}`,
        url: new URL("index.json", STORYBOOK_URL).href,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});

function getWorkers() {
  const workers = process.env.VISUAL_WORKERS;
  if (workers) {
    return /^\d+$/.test(workers) ? Number(workers) : workers;
  }
  return isCI ? 4 : undefined;
}
