/**
 * Helpers unique to the metrics-reproductions port.
 *
 * Everything else this spec needs already lives in shared modules
 * (createQuestion / createDashboard on mb.api; MetricEditor in metrics-editing.ts;
 * MetricPage / visitMetric in metrics.ts; the visualizer surface in
 * visualizer-basics.ts; dashboard editing in dashboard.ts) — import those
 * read-only.
 */
import type { Locator, Page, Response } from "@playwright/test";

const QUERY_METADATA_RE = /\/api\/card\/\d+\/query_metadata/;

// Port of H.main() — now canonical in ./ui; re-exported so this module's
// consumers keep their import unchanged.
export { main } from "./ui";

/**
 * Port of the issue-47058 intercept: hold every GET /api/card/:id/query_metadata
 * open for `delayMs` before continuing, so the notebook's loading state is
 * observable. Register before navigating.
 */
export async function delayQueryMetadata(page: Page, delayMs = 1000) {
  await page.route(QUERY_METADATA_RE, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

/** Await the next GET /api/card/:id/query_metadata response (the delayed one). */
export function waitForQueryMetadata(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      QUERY_METADATA_RE.test(new URL(response.url()).pathname),
  );
}
