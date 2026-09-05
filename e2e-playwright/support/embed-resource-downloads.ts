/**
 * Helpers for the embed-resource-downloads spec port
 * (e2e/test/scenarios/embedding/embed-resource-downloads.cy.spec.ts) — the
 * `downloads` flag for STATIC ("guest") embeds, both dashboards and questions.
 *
 * NEW helpers live here (parallel-agent rule: no edits to shared modules). The
 * embed-visit / api / download / table helpers are IMPORTED read-only from the
 * shared modules (embedding-dashboard.ts, downloads.ts, data-model.ts,
 * factories.ts, ui.ts, dashboard.ts).
 *
 * Downloads: the Cypress original could not let a download complete (it wedged
 * the runner) so it intercepted the export request and redirected it away; here
 * the real browser download lands as a file (page.waitForEvent("download")) and
 * we assert its suggestedFilename — strictly stronger than the original.
 */
import { expect } from "@playwright/test";
import type { Download, Page } from "@playwright/test";

import { getDashboardCard } from "./dashboard";
import { main, popover } from "./ui";

/**
 * Port of cy.deleteDownloadsFolder — a no-op here: Playwright downloads land in
 * per-run temp dirs, so there is no shared downloads folder to clear.
 */
export const deleteDownloadsFolder = async () => {};

// === embed helpers ===

/** Port of `H.main().findByText("Loading...").should("not.exist")`. */
export async function waitLoading(page: Page) {
  await expect(main(page).getByText("Loading...", { exact: true })).toHaveCount(
    0,
  );
}

/**
 * Port of H.getEmbeddedDashboardCardMenu (e2e-dashboard-helpers.ts): the
 * public/embedded dashcard "..." menu, revealed on hovering the card.
 */
export function getEmbeddedDashboardCardMenu(page: Page, index = 0) {
  return getDashboardCard(page, index).getByTestId(
    "public-or-embedded-dashcard-menu",
  );
}

const CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Drive the "Download results" popover on an embedded QUESTION and return the
 * completed browser Download. Used by the non-endpoint-asserting cases
 * (the .png / .csv "should be able to download" tests, which upstream only
 * cy.verifyDownload the suggested filename).
 */
export async function downloadEmbedQuestion(
  page: Page,
  format: string,
): Promise<Download> {
  // The embed footer's "Download results" control is revealed on pointer-over
  // (rule 4). Cypress's synthetic click found it without moving the mouse;
  // Playwright's real cursor must hover the viz first — the same
  // `main(page).hover()` the embedding-questions "without token" test uses.
  await main(page).hover();
  await page
    .getByRole("button", { name: "Download results", exact: true })
    .click();

  const menu = popover(page);
  await menu.getByText(format, { exact: true }).click();

  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();
  return downloadEvent;
}

/**
 * Port of the last two tests' `H.downloadAndAssert({ isEmbed: true, fileType,
 * downloadUrl: "/api/embed/card/*​/query/<type>*", downloadMethod: "GET" })`:
 * drive the download popover (honoring the keep-data-formatted toggle), wait for
 * the real GET export against the embed endpoint plus the browser download, and
 * assert the response is a 200 with the right content type.
 */
export async function downloadAndAssertEmbedQuestion(
  page: Page,
  {
    fileType,
    enableFormatting = true,
  }: { fileType: "csv" | "xlsx"; enableFormatting?: boolean },
): Promise<Download> {
  await page
    .getByRole("button", { name: "Download results", exact: true })
    .click();

  const menu = popover(page);
  await menu.getByText(`.${fileType}`, { exact: true }).click();

  const formattingCheckbox = menu.getByTestId("keep-data-formatted");
  if ((await formattingCheckbox.isChecked()) !== enableFormatting) {
    await formattingCheckbox.click();
  }

  const exportPath = new RegExp(`^/api/embed/card/[^/]+/query/${fileType}$`);
  const exportResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      exportPath.test(new URL(response.url()).pathname),
  );
  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();

  const [response, download] = await Promise.all([
    exportResponse,
    downloadEvent,
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(CONTENT_TYPES[fileType]);
  return download;
}
