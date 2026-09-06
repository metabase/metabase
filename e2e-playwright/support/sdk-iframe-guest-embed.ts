import type { Download, FrameLocator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import type { MetabaseApi } from "./api";
import { createQuestion } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";
import { popover } from "./ui";

/**
 * Spec-local support for the port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-embed.cy.spec.ts
 *
 * `support/sdk-iframe.ts` (the shared embed.js harness) and
 * `support/sdk-iframe-guest-token-refresh.ts` (`prepareGuestEmbedSdkIframeEmbedTest`,
 * `signGuestJwt`) are both consumed read-only, per PORTING rule 9. The two
 * things neither covers are here: the spec's question fixture, and a
 * frame-scoped port of `H.downloadAndAssert`'s GET/embed branch.
 */

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Port of the spec's `createQuestion({ name: "47563", ... })`.
 *
 * `embedding_type: "guest-embed"` is deliberately NOT forwarded. Upstream's
 * `question()` (e2e/support/helpers/api/createQuestion.ts:119) destructures the
 * fields it sends and `embedding_type` is not among them — it is silently
 * dropped, so the card upstream creates carries only `enable_embedding: true`
 * (applied by the follow-up PUT). `factories.createQuestion` spreads unknown
 * keys into `POST /api/card`, so passing it on would make this fixture
 * STRONGER than the original rather than equal to it.
 */
export async function createGuestEmbedQuestion(
  api: MetabaseApi,
): Promise<number> {
  const question = await createQuestion(api, {
    name: "47563",
    enable_embedding: true,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
      breakout: [["field", ORDERS.PRODUCT_ID, null]],
      limit: 2,
    },
  });
  return question.id;
}

/** The alias `prepareGuestEmbedSdkIframeEmbedTest` registers as
 * `@getCardQuery`: `GET /api/embed/card/*​/query*`. */
export const EMBED_CARD_QUERY_RE = /^\/api\/embed\/card\/[^/]+\/query$/;

/**
 * Port of `cy.wait("@getCardQuery")`. Arm before the page load, await after
 * (PORTING rule 2).
 */
export function waitForEmbedCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      EMBED_CARD_QUERY_RE.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

/**
 * Port of `H.downloadAndAssert({ isDashboard: false, isEmbed: true,
 * downloadMethod: "GET", downloadUrl: "/api/embed/card/*​/query/csv*" })`,
 * scoped to the embed iframe (upstream calls it inside
 * `frame.within(...)`, so every `cy.findBy*` resolves against the iframe body).
 *
 * Two deliberate differences from the Cypress helper, both strengthenings of
 * the kind FINDINGS #4 describes:
 *
 * - The download is allowed to COMPLETE. Cypress could not let one finish
 *   (it wedges the runner), so its POST branch intercepted-and-redirected the
 *   response away; its GET branch just watches the request go by. Here we wait
 *   for the real `download` event as well as the response.
 * - The saved file is parsed, not just observed. Upstream asserts only the
 *   status code on this call site (`assertStatusCode: 200`).
 *
 * `waitForDismiss` is not a parameter: the single call site passes `false`.
 */
export async function downloadEmbedCsvFromFrame(
  page: Page,
  frame: FrameLocator,
  { enableFormatting = true }: { enableFormatting?: boolean } = {},
): Promise<{ download: Download; body: string }> {
  const downloadButton = frame.getByLabel("Download results", { exact: true });
  await expect(downloadButton).toBeVisible({ timeout: 40_000 });
  await downloadButton.click();

  const menu = popover(frame);
  await menu.getByText(".csv", { exact: true }).click();

  const formattingCheckbox = menu.getByTestId("keep-data-formatted");
  if ((await formattingCheckbox.isChecked()) !== enableFormatting) {
    await formattingCheckbox.click();
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/embed\/card\/[^/]+\/query\/csv$/.test(
        new URL(response.url()).pathname,
      ),
    { timeout: 60_000 },
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

  await menu.getByTestId("download-results-button").click();

  const [response, download] = await Promise.all([
    responsePromise,
    downloadPromise,
  ]);

  // Upstream's `assertStatusCode: 200`.
  expect(response.status()).toBe(200);

  const fs = await import("fs");
  const body = fs.readFileSync(await download.path(), "utf8");
  return { download, body };
}
