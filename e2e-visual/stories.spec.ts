import path from "node:path";

import {
  type Page,
  type Request,
  type ViewportSize,
  expect,
  test,
} from "@playwright/test";

import {
  type ContentBox,
  awaitLokiReady,
  disableAnimations,
  getContentBox,
  getStoryRenderResult,
  installLokiShim,
} from "./page-scripts";
import { CAPTURED_DIR } from "./paths";
import {
  getSelectionFromEnv,
  getSnapshotName,
  loadStories,
  selectStories,
} from "./storybook";

const DEFAULT_SELECTOR = "#root > *, #storybook-root > *";
const REQUEST_QUIET_MS = 100;
const RESIZE_SETTLE_MS = 500;
const UNTRACKED_RESOURCE_TYPES = ["eventsource", "websocket"];

for (const story of selectStories(loadStories(), getSelectionFromEnv())) {
  test(`${story.title} / ${story.name} [${story.id}]`, async ({ page }) => {
    const requests = trackRequests(page);
    await page.addInitScript(installLokiShim);
    await page.addInitScript(disableAnimations);
    await test.step("open the story", () =>
      page.goto(
        `iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`,
      ));

    const result = await test.step("wait for the story to render", async () => {
      const handle = await page.waitForFunction(
        getStoryRenderResult,
        story.id,
        { polling: 100 },
      );
      return handle.jsonValue();
    });
    if (result?.status !== "rendered") {
      throw new Error(
        `Storybook failed to render the story: ${result?.message}`,
      );
    }

    await test.step("wait for network requests to finish", () =>
      requests.waitForQuiet());
    requests.assertNoneFailed();
    await test.step("wait for async callbacks", () =>
      page.evaluate(awaitLokiReady));
    requests.assertNoneFailed();

    const clip = await test.step("fit the viewport to the story", async () => {
      const selector = result.chromeSelector ?? DEFAULT_SELECTOR;
      const box = await page.evaluate(getContentBox, selector);
      const viewport = getViewport(page);
      const storyClip = toClip(box, selector, viewport.width);
      await growViewportToFit(page, viewport, storyClip.y + storyClip.height);
      return storyClip;
    });

    const snapshotName = getSnapshotName(story);
    await test.step("compare the screenshot", () =>
      expect(page).toHaveScreenshot(snapshotName, { clip }));
    // toHaveScreenshot only writes the image it took when the comparison fails,
    // so a passing run keeps its own copy for comparing runs byte for byte.
    await test.step("save the screenshot", () =>
      page.screenshot({
        clip,
        animations: "disabled",
        caret: "hide",
        path: path.join(CAPTURED_DIR, snapshotName),
      }));
  });
}

function trackRequests(page: Page) {
  const inFlight = new Set<Request>();
  const failures = new Map<Request, string>();

  page.on("request", (request) => {
    if (!UNTRACKED_RESOURCE_TYPES.includes(request.resourceType())) {
      inFlight.add(request);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.set(
        response.request(),
        `${response.status()} ${response.url()}`,
      );
    }
  });
  page.on("requestfinished", (request) => inFlight.delete(request));
  page.on("requestfailed", (request) => {
    inFlight.delete(request);
    // Chromium can report a request with an error status as failed too, so keep its first entry.
    if (!failures.has(request)) {
      failures.set(request, `${request.failure()?.errorText} ${request.url()}`);
    }
  });

  return {
    assertNoneFailed() {
      if (failures.size > 0) {
        throw new Error(
          `Requests failed while the story loaded:\n${[...failures.values()].join("\n")}`,
        );
      }
    },
    async waitForQuiet() {
      let quietSince = Date.now();
      while (Date.now() - quietSince < REQUEST_QUIET_MS) {
        if (inFlight.size > 0) {
          quietSince = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
}

function toClip(
  box: ContentBox,
  selector: string,
  viewportWidth: number,
): ContentBox {
  if (box.width === 0 || box.height === 0) {
    throw new Error(`"${selector}" has zero width or height`);
  }

  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
  if (clip.x < 0) {
    clip.width += clip.x;
    clip.x = 0;
  }
  if (clip.y < 0) {
    clip.height += clip.y;
    clip.y = 0;
  }
  clip.width = Math.min(clip.width, viewportWidth - clip.x);
  return clip;
}

async function growViewportToFit(
  page: Page,
  viewport: ViewportSize,
  contentBottom: number,
) {
  if (contentBottom > viewport.height) {
    await page.setViewportSize({
      width: viewport.width,
      height: contentBottom,
    });
    // Components that measure their container re-render on a throttle after a resize,
    // and nothing signals when they are done.
    await page.waitForTimeout(RESIZE_SETTLE_MS);
  }
}

function getViewport(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("The visual tests need a fixed viewport size");
  }
  return viewport;
}
