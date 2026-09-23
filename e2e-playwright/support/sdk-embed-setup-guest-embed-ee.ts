import type { Page, Request } from "@playwright/test";

/**
 * Spec-local support for
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/guest-embed-ee.cy.spec.ts
 *
 * Everything else this port needs already exists read-only in
 * `support/sdk-embed-setup.ts` (the wizard helper), `support/sdk-iframe.ts`
 * (the embed.js harness), `support/embedding-dashboard.ts`
 * (`setEmbeddingParameter` / `assertEmbeddingParameter` / `publishChanges`) and
 * `support/public-sharing-embed-button-behavior.ts` (`unpublishChanges`).
 *
 * NOTE ON `prepareGuestEmbedSdkIframeEmbedTest`. The brief expected this port
 * to need it (it is the ~20-line gap `findings-inbox/sdk-iframe-harness.md` §2
 * flagged as required by three guest specs). It does NOT: those three specs are
 * in the *other* tier (`sdk-iframe-embedding/`). `guest-embed-ee.cy.spec.ts`
 * builds its own `beforeEach` inline and reaches the guest embed page through
 * `loadSdkIframeEmbedTestPage({ metabaseConfig: { isGuest: true } })`, which
 * `support/sdk-iframe.ts` already supports unchanged. So nothing is added here
 * for it — see findings.
 */

/**
 * Port of `cy.intercept("GET", "api/preview_embed/card/*").as("previewEmbed")`
 * + the later `cy.wait("@previewEmbed")`.
 *
 * PORTING.md rule 2 says arm a `waitForResponse` before the triggering action —
 * but that is not what this upstream pair does. The intercept is registered at
 * the very top of the test and the `cy.wait` comes ~100 lines later, after the
 * preview has already fetched many times; `cy.wait` **consumes a past
 * response**, so it resolves retroactively against the first preview request.
 * A `waitForResponse` armed at the `cy.wait` site would instead hang waiting
 * for a *new* one. The faithful shape is a passive recorder installed where
 * upstream registers the intercept, read where upstream waits.
 */
export function capturePreviewEmbedRequests(page: Page): Request[] {
  const requests: Request[] = [];

  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname.startsWith("/api/preview_embed/card/")
    ) {
      requests.push(request);
    }
  });

  return requests;
}
