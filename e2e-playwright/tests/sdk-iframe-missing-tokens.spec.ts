import { expect, test } from "../support/fixtures";
import {
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/missing-tokens.cy.spec.ts
 *
 * Group A — the `embed.js` customer-page harness in `support/sdk-iframe.ts`,
 * consumed read-only. No companion support module needed.
 *
 * Port notes:
 *
 * - The two tests differ in EXACTLY ONE input: the origin the customer page is
 *   served from. Test 1 passes `origin: "http://example.com"`; test 2 passes
 *   nothing, so the page is served from the slot's own (localhost) origin —
 *   upstream's `origin: ""`, which resolved to Cypress's baseUrl. Everything
 *   else, including `withToken: "starter"`, comes from the shared `beforeEach`
 *   and must be identical between them.
 *
 * - `cy.wrap(body.unmasked_key).as("apiKey")` + `cy.get<string>("@apiKey")` is
 *   Cypress plumbing for getting the key out of the prepare helper. The ported
 *   `prepareSdkIframeEmbedTest` returns it directly.
 *
 * - `origin: "http://example.com"` is upgraded to `https://` by the harness's
 *   `productionSafeOrigin` (Chromium's Private Network Access blocks an
 *   insecure non-loopback document from reaching a loopback address). The
 *   behaviour under test is unaffected: `embed.ts#_getIsLocalhost` reads
 *   `window.location.hostname` only, so the scheme is invisible to it, and
 *   `example.com` is still "not localhost" — which is the whole point.
 *
 * - The error text is asserted **exactly**. `SdkError` appends "Read more."
 *   into the same text container only when `ERROR_DOC_LINKS[code]` exists, and
 *   that table has a single entry (`EXISTING_USER_SESSION_FAILED`), which is
 *   not this code.
 *
 * - Test 2's `should("not.exist")` → retrying `toHaveCount(0)` (identical
 *   semantics). It is anchored on the embed having actually rendered its
 *   content — the `questionId: "new"` notebook's "Pick your starting data" —
 *   rather than on `data-iframe-loaded`, which fires long before the SDK paints
 *   and would make the absence check vacuous.
 */

const LICENSE_ERROR = "A valid license is required for embedding.";

const QUESTION_ELEMENT = [
  {
    component: "metabase-question" as const,
    attributes: { questionId: "new" },
  },
];

test.describe("scenarios > embedding > sdk iframe embedding > without token features", () => {
  test("shows an error if the token features are missing and the parent page is not localhost", async ({
    page,
    mb,
  }) => {
    const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "starter",

      // JWT requires a valid license to use, so we expect customers to use API keys when testing.
      enabledAuthMethods: ["api-key"],

      signOut: true,
    });

    // Upstream visits its baseUrl (hardcoded `http://localhost:4000`) before
    // serving the customer page from a different origin. On the slot model that
    // is `mb.baseUrl`.
    await page.goto(mb.baseUrl);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: QUESTION_ELEMENT,
      origin: "http://example.com",
      metabaseConfig: { apiKey },
    });

    await expect(frame.getByText(LICENSE_ERROR, { exact: true })).toBeVisible({
      timeout: 40_000,
    });
  });

  test("does not show an error if the token features are missing and the parent page is localhost", async ({
    page,
    mb,
  }) => {
    const { apiKey } = await prepareSdkIframeEmbedTest(page, mb, {
      withToken: "starter",
      enabledAuthMethods: ["api-key"],
      signOut: true,
    });

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: QUESTION_ELEMENT,
      metabaseConfig: { apiKey },
    });

    await waitForSimpleEmbedIframesToLoad(page);

    // Positive anchor: the embed rendered its actual content. Without this the
    // absence assertion below would be satisfied by "nothing has painted yet".
    await expect(
      frame.getByText("Pick your starting data", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });

    await expect(frame.getByText(LICENSE_ERROR, { exact: true })).toHaveCount(0);
  });
});
