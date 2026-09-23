/**
 * Helpers for tests/mid-stream-download-failure.spec.ts.
 *
 * Ports the download-popover flow the mid-stream-failure repro drives, plus the
 * status-toast assertion. Unlike support/downloads.ts `downloadAndAssert` (which
 * asserts the export *succeeds* and parses the resulting file), this export is
 * expected to abort mid-stream, so no browser download event ever fires — the
 * frontend surfaces the failure in the download-status toast instead. We assert
 * on that toast, exactly as the Cypress original did.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { popover } from "./ui";

/**
 * A native query that streams fine for the capped preview (the query builder
 * caps results at 2000 rows, below the division-by-zero at row 5000) but blows
 * up partway through an unbounded CSV export.
 */
export const FAILS_MID_STREAM_QUERY =
  "SELECT 100 / (x - 5000) AS v FROM SYSTEM_RANGE(1, 10000)";

/**
 * Open the download popover, pick the file type, and trigger the export.
 * Mirrors the Cypress original's popover().within(() => { .csv; download }).
 */
export async function triggerDownload(
  page: Page,
  fileType: "csv" | "xlsx",
): Promise<void> {
  const downloadButton = page.getByLabel("Download results", { exact: true });
  await expect(downloadButton).toBeVisible();
  await downloadButton.click();

  const menu = popover(page);
  await menu.getByText(`.${fileType}`, { exact: true }).click();
  await menu.getByTestId("download-results-button").click();
}

/**
 * Port of the final assertion: the aborted stream surfaces as a download error,
 * not a silent success. The status toast can take a while to flip to the error
 * state once the stream aborts, hence the generous timeout (Cypress used 15s).
 */
export async function expectDownloadError(page: Page): Promise<void> {
  const status = page.getByTestId("status-root-container");
  await expect(status).toContainText("Download error", { timeout: 15_000 });
  await expect(status).not.toContainText("Download completed");
}
