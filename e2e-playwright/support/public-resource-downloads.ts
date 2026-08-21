/**
 * Helpers for the public-resource-downloads spec port
 * (e2e/test/scenarios/sharing/public-resource-downloads.cy.spec.ts) — the
 * `downloads` flag for PUBLIC-link dashboards and questions: the
 * `#downloads=true/false/pdf/results` hash controls which export UI (PDF /
 * "Download results") appears, and a real export runs from the public page.
 *
 * Only the genuinely NEW public-download helpers live here. Everything reusable
 * is IMPORTED read-only from shared modules:
 * - createPublicLink            → public-sharing.ts
 * - snowplow assertions (real, per-slot collector) → ../support/snowplow
 * - waitLoading / getEmbeddedDashboardCardMenu /
 *   deleteDownloadsFolder / downloadEmbedQuestion → embed-resource-downloads.ts
 * - main / popover              → ui.ts
 * - getDashboardCard           → dashboard.ts
 *
 * Endpoints (verified in frontend/src/metabase/redux/downloads.ts):
 * - Public dashcard export: POST /api/public/dashboard/<uuid>/dashcard/<dashcardId>/card/<cardId>/<type>
 * - Public question export: GET  /public/question/<uuid>.<type>?parameters=...
 *   The FE fetches both as blobs (openSaveDialog), so download.url() is a blob
 *   URL — assert on the export *response*, not the download URL (PORTING gotcha).
 *   The public-question params are mapped down to just {id, value}
 *   (getPublicQuestionParams), which is what the metabase#… params test checks.
 */
import type { Download, Page, Request, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import { getDashboardCard } from "./dashboard";
import { getEmbeddedDashboardCardMenu } from "./embed-resource-downloads";
import { main, popover } from "./ui";

const CSV_CONTENT_TYPE = "text/csv";

/**
 * Drive the shared "Download results" popover: click the trigger, pick the
 * file type, honor the keep-data-formatted toggle, and return the open popover
 * so the caller can register its export wait before clicking the final button.
 */
async function openDownloadPopover(
  page: Page,
  fileType: "csv" | "xlsx",
  enableFormatting: boolean,
) {
  const downloadButton = page.getByLabel("Download results", { exact: true });
  await expect(downloadButton).toBeVisible();
  await downloadButton.click();

  const menu = popover(page);
  await menu.getByText(`.${fileType}`, { exact: true }).click();

  const formattingCheckbox = menu.getByTestId("keep-data-formatted");
  if ((await formattingCheckbox.isChecked()) !== enableFormatting) {
    await formattingCheckbox.click();
  }

  return menu;
}

/**
 * Port of `H.downloadAndAssert({ publicUuid, isDashboard: true, isEmbed: true,
 * dashcardId, questionId, fileType: "csv" })`: hover the public dashcard, open
 * its "..." menu, drive the download popover, and assert the POST export
 * against the public-dashcard endpoint is a 200 with the right content type.
 */
export async function downloadPublicDashcardCsv(
  page: Page,
  {
    uuid,
    dashcardId,
    fileType = "csv",
  }: {
    uuid: string;
    dashcardId: number;
    fileType?: "csv" | "xlsx";
  },
): Promise<{ download: Download; response: Response }> {
  await getDashboardCard(page).hover();
  await getEmbeddedDashboardCardMenu(page).click();

  const menu = await openDownloadPopover(page, fileType, true);

  // The trailing card id comes from the dashcard, not the caller (upstream used
  // a `card/*/<type>` wildcard) — match the prefix + type, ignoring the id.
  const prefix = `/api/public/dashboard/${uuid}/dashcard/${dashcardId}/card/`;
  const exportResponse = page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      pathname.startsWith(prefix) &&
      pathname.endsWith(`/${fileType}`)
    );
  });
  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();

  const [response, download] = await Promise.all([
    exportResponse,
    downloadEvent,
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(CSV_CONTENT_TYPE);

  return { download, response };
}

/**
 * Port of `H.downloadAndAssert({ publicUuid, isDashboard: false, isEmbed: true,
 * fileType: "csv" })` for a public QUESTION: hover the viz to reveal the footer
 * control, drive the download popover, and assert the GET export against the
 * public-question endpoint is a 200 with the right content type. Returns the
 * matched Request so callers can inspect the `parameters` query string.
 */
export async function downloadPublicQuestionCsv(
  page: Page,
  {
    uuid,
    fileType = "csv",
  }: { uuid: string; fileType?: "csv" | "xlsx" },
): Promise<{ download: Download; response: Response | null; request: Request }> {
  // The footer "Download results" control is revealed on pointer-over (rule 4);
  // Cypress's synthetic click found it without moving the mouse.
  await main(page).hover();

  const menu = await openDownloadPopover(page, fileType, true);

  // The public-question export GET (`/public/question/<uuid>.<type>?parameters=`)
  // is answered with a 302 to the actual results endpoint — the server redirects
  // automatically (e2e-downloads-helpers getEndpoint marks this path GET, and
  // the Cypress original never asserted a 200 on it). We capture the initial GET
  // (which carries the `parameters` query string the params test inspects) and
  // let the browser follow the redirect to complete the download.
  const endpoint = `/public/question/${uuid}.${fileType}`;
  const exportRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === endpoint,
  );
  const downloadEvent = page.waitForEvent("download");
  await menu.getByTestId("download-results-button").click();

  const [request, download] = await Promise.all([
    exportRequest,
    downloadEvent,
  ]);
  const response = await request.response();

  return { download, response, request };
}
