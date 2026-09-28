import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Browser, Page, TestInfo } from "@playwright/test";

import { PROFILE_DIR } from "./paths";
import { collectProfile, installProfiler } from "./profile-scripts";

const PROFILE_MODE = process.env.VISUAL_PROFILE;

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-v8.cpu_profiler",
  "blink.user_timing",
  "loading",
  "v8",
  "v8.execute",
];

let tracingBrowser: Browser | undefined;

export type StoryProfiler = {
  mark: (name: string) => void;
  finish: (storyId: string, testInfo: TestInfo) => Promise<void>;
};

// VISUAL_PROFILE=1 records the page's boot timeline for each story,
// and VISUAL_PROFILE=trace also records a Chromium performance trace.
export async function startProfiler(
  page: Page,
): Promise<StoryProfiler | undefined> {
  if (!PROFILE_MODE) {
    return undefined;
  }
  await page.addInitScript(installProfiler);

  const browser = page.context().browser();
  const trace = PROFILE_MODE === "trace" && browser !== null;
  if (trace) {
    // A test that failed mid-trace leaves the browser tracing.
    if (tracingBrowser) {
      await tracingBrowser.stopTracing();
    }
    await browser.startTracing(page, { categories: TRACE_CATEGORIES });
    tracingBrowser = browser;
  }

  const marks: Record<string, number> = {};
  return {
    mark: (name) => {
      marks[name] = Date.now();
    },
    finish: async (storyId, testInfo) => {
      const profile = await page.evaluate(collectProfile);
      const base = path.join(
        PROFILE_DIR,
        `${storyId}-${testInfo.repeatEachIndex}`,
      );
      await mkdir(PROFILE_DIR, { recursive: true });
      await writeFile(
        `${base}.json`,
        JSON.stringify({
          storyId,
          repeat: testInfo.repeatEachIndex,
          workers: testInfo.config.workers,
          cpus: os.cpus().length,
          marks,
          page: profile,
        }),
      );
      if (trace && tracingBrowser) {
        const buffer = await tracingBrowser.stopTracing();
        tracingBrowser = undefined;
        await writeFile(`${base}.trace.json`, buffer.toString("utf8"));
      }
    },
  };
}
