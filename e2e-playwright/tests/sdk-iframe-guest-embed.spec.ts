import { expect, test } from "../support/fixtures";
import { loadSdkIframeEmbedTestPage } from "../support/sdk-iframe";
import {
  createGuestEmbedQuestion,
  downloadEmbedCsvFromFrame,
  waitForEmbedCardQuery,
} from "../support/sdk-iframe-guest-embed";
import {
  prepareGuestEmbedSdkIframeEmbedTest,
  signGuestJwt,
} from "../support/sdk-iframe-guest-token-refresh";

/**
 * Port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-embed.cy.spec.ts
 *
 * Group A — `support/sdk-iframe.ts` and the guest-embed pieces in
 * `support/sdk-iframe-guest-token-refresh.ts` are consumed read-only; the
 * question fixture and the frame-scoped CSV download live in
 * `support/sdk-iframe-guest-embed.ts`.
 *
 * Port notes:
 *
 * - `MB_EDITION` is fixed to "ee". Upstream derives the describe title (and an
 *   `@OSS` tag) from `Cypress.expose("IS_ENTERPRISE")`; the spike's backend is
 *   always the EE jar, so only the `ee` arm is reachable and the `@OSS` tag
 *   never applies. `prepareGuestEmbedSdkIframeEmbedTest` already activates the
 *   token unconditionally for the same reason.
 *
 * - `getSignedJwtForResource({ resourceId, resourceType: "question" })` →
 *   `signGuestJwt({ questionId, expirationSeconds: 600 })`. Same payload
 *   (`{ resource: { question: id }, params: {}, iat, exp }`) and the same
 *   10-minute expiry; the shared signer already stamps `iat` explicitly, which
 *   `jose`/`jsonwebtoken` do for upstream.
 *
 * - `cy.wait("@getCardQuery")` — the alias is registered inside upstream's
 *   prepare helper. PORTING rule 2 has specs arm their own wait, so
 *   `waitForEmbedCardQuery` is armed immediately before the page load and
 *   awaited after it.
 *
 * - `embedding_type: "guest-embed"` on the question fixture is dropped; see
 *   `createGuestEmbedQuestion` for why (upstream's `question()` never sends it).
 */

test.describe("scenarios > embedding > sdk iframe embedding > guest-embed > ee", () => {
  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await prepareGuestEmbedSdkIframeEmbedTest(mb, {
      onPrepare: async () => {
        questionId = await createGuestEmbedQuestion(mb.api);
      },
    });
  });

  test("shows a static question", async ({ page, mb }) => {
    const token = signGuestJwt({ questionId, expirationSeconds: 600 });

    const cardQuery = waitForEmbedCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      metabaseConfig: { isGuest: true },
      elements: [
        {
          component: "metabase-question",
          attributes: { token },
        },
      ],
    });

    await cardQuery;

    await expect(frame.getByText("Product ID", { exact: true })).toBeVisible({
      timeout: 40_000,
    });
    await expect(
      frame.getByText("Max of Quantity", { exact: true }),
    ).toBeVisible();
  });

  test("allows to download a static question as CSV", async ({ page, mb }) => {
    const token = signGuestJwt({ questionId, expirationSeconds: 600 });

    const cardQuery = waitForEmbedCardQuery(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      metabaseConfig: { isGuest: true },
      elements: [
        {
          component: "metabase-question",
          attributes: { token, "with-downloads": true },
        },
      ],
    });

    await cardQuery;

    const { download, body } = await downloadEmbedCsvFromFrame(page, frame);

    // Strengthening over upstream, which asserts only the status code: the
    // download completes and the file is the question's two rows plus a header.
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    expect(body.split("\n").filter(Boolean)).toHaveLength(3);
  });

  test("shows an error for a component without guest embed support", async ({
    page,
    mb,
  }) => {
    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      metabaseConfig: { isGuest: true },
      elements: [
        {
          component: "metabase-browser",
          attributes: {},
        },
      ],
    });

    await expect(
      frame.getByText("This component does not support guest embeds", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 40_000 });
  });
});
