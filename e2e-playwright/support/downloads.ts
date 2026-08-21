/**
 * Ports of the download `H` helpers (e2e-downloads-helpers.ts and the
 * cy.task-based downloadUtils).
 *
 * The Cypress version could not let a download actually complete (it wedges
 * the runner), so downloadAndAssert intercepted the export request, asserted
 * on status/content-type, and redirected the response away. Playwright tests
 * run in Node and downloads land in a temp dir, so this port waits for the
 * real browser download alongside the export response, then parses the file
 * with the same `xlsx` library the Cypress downloadUtils used — strictly
 * stronger assertions than the original.
 */
import type { Download, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import * as XLSX from "xlsx";

import { getDashboardCardMenu } from "./dashboard-cards";
import { popover } from "./ui";

export type ExportFileType = "csv" | "xlsx";

const CONTENT_TYPES: Record<ExportFileType, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export interface DownloadAndAssertOptions {
  fileType: ExportFileType;
  /** needed only for saved questions */
  questionId?: number;
  dashcardId?: number;
  dashboardId?: number;
  /** downloading is tested on a dashboard: opens the dashcard menu first */
  isDashboard?: boolean;
  enableFormatting?: boolean;
  pivoting?: "pivoted" | "non-pivoted";
  /**
   * Expected number of data rows in the exported sheet (header excluded).
   * The Cypress helper accepted-and-ignored a row count in some call sites
   * (assertOrdersExport); here it's a real assertion.
   */
  assertRowCount?: number;
  /** Wait for the download-status toast to auto-dismiss (Cypress default). */
  waitForDismiss?: boolean;
}

/**
 * Port of the endpoint mapping in e2e-downloads-helpers.ts getEndpoint().
 * One fix over the original: a saved question always exports through
 * /api/card/:id/query/:type (see getInternalQuestionParams in
 * frontend/src/metabase/redux/downloads.ts); the Cypress mapping sent
 * saved-question downloads without a questionId to /api/dataset, which only
 * ad-hoc questions actually hit.
 */
function getEndpoint({
  fileType,
  questionId,
  dashcardId,
  dashboardId,
}: DownloadAndAssertOptions): string {
  if (dashcardId != null && dashboardId != null) {
    return `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${questionId}/query/${fileType}`;
  }
  if (questionId != null) {
    return `/api/card/${questionId}/query/${fileType}`;
  }
  return `/api/dataset/${fileType}`;
}

/** Parse an exported file (xlsx or csv — the lib handles both) into rows. */
export function readSheetRows(filePath: string): unknown[][] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

/**
 * Port of H.downloadAndAssert: drives the download popover, asserts the
 * export request succeeds with the right endpoint and content type, and
 * resolves with the parsed sheet rows (header row included).
 */
export async function downloadAndAssert(
  page: Page,
  options: DownloadAndAssertOptions,
): Promise<{ download: Download; rows: unknown[][] }> {
  const {
    fileType,
    isDashboard = false,
    enableFormatting = true,
    pivoting,
    assertRowCount,
    waitForDismiss = true,
  } = options;
  const endpoint = getEndpoint(options);

  if (isDashboard) {
    await (await getDashboardCardMenu(page)).click();
  }

  const downloadButton = page.getByLabel("Download results", { exact: true });
  await expect(downloadButton).toBeVisible();
  await downloadButton.click();

  const menu = popover(page);
  await menu.getByText(`.${fileType}`, { exact: true }).click();

  const formattingCheckbox = menu.getByTestId("keep-data-formatted");
  if ((await formattingCheckbox.isChecked()) !== enableFormatting) {
    await formattingCheckbox.click();
  }

  if (pivoting != null) {
    const pivotingCheckbox = menu.getByTestId("keep-data-pivoted");
    if ((await pivotingCheckbox.isChecked()) !== (pivoting === "pivoted")) {
      await pivotingCheckbox.click();
    }
  }

  const exportResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === endpoint,
  );
  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();

  const [response, download] = await Promise.all([
    exportResponse,
    downloadEvent,
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(CONTENT_TYPES[fileType]);

  const rows = readSheetRows(await download.path());
  expect(rows.length).toBeGreaterThan(0);
  if (assertRowCount != null) {
    // First row is the column-header row.
    expect(rows.length - 1).toBe(assertRowCount);
  }

  if (waitForDismiss) {
    await ensureDownloadStatusDismissed(page);
  }

  return { download, rows };
}

/**
 * Port of H.exportFromDashcard (non-tabular exports like .png): assumes the
 * dashcard menu is already open, drives the download popover, and resolves
 * with the completed Download.
 */
export async function exportFromDashcard(
  page: Page,
  format: string,
): Promise<Download> {
  await page.getByLabel("Download results", { exact: true }).click();

  const menu = popover(page);
  await menu.getByText(format, { exact: true }).click();

  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();
  const download = await downloadEvent;

  // The Cypress helper asserted "Downloading" mid-flight; by the time the
  // download event resolves the toast may already read "Done!"/"Download
  // completed", so match the stable common prefix.
  await expect(page.getByTestId("status-root-container")).toContainText(
    /Download/,
  );

  return download;
}

/**
 * Port of ensureDownloadStatusDismissed: the status toast auto-closes a few
 * seconds after an export completes; wait it out so it can't swallow clicks
 * meant for elements underneath it.
 */
export async function ensureDownloadStatusDismissed(page: Page) {
  await expect(
    page.getByTestId("status-root-container").getByText(/Download/),
  ).toHaveCount(0, { timeout: 15_000 });
}
