import type { Page, Request, Response } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Spec-local support for
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-entity.cy.spec.ts
 *
 * Everything reusable across this tier already lives in
 * `support/sdk-embed-setup.ts` (the wizard helper — `visitNewEmbedPage`,
 * `getEmbedSidebar`, `getResourceSelectorButton`, `embedModalEnableEmbedding`,
 * `logRecent`), and `embedPreview` (the loaded-preview gate that ports
 * `H.getSimpleEmbedIframeContent`) already exists in
 * `support/sdk-embed-setup-select-embed-options.ts`. Both are consumed
 * read-only. This module holds only the two passive recorders below.
 */

const DASHBOARD_PATH_RE = /^\/api\/dashboard\/\d+$/;

/**
 * Port of the `cy.intercept("GET", "/api/dashboard/*").as("dashboard")` that
 * `visitNewEmbedPage` registers, as read by this spec's later
 * `cy.wait("@dashboard")`.
 *
 * Why a passive recorder rather than PORTING.md rule 2's armed
 * `waitForResponse`: the `cy.wait` here is *retroactive*. By the time the spec
 * reaches it, the wizard may already have refetched the dashboard (the
 * entity-picker selection and, in one test, an auth-mode switch both re-render
 * the preview), and `cy.wait` consumes a past response. An armed
 * `waitForResponse` at the same site would instead block on a *new* request
 * that may never come.
 *
 * What the wait means in context: both call sites are the `cy.log("selected
 * dashboard should be shown in the preview")` settle, so the recorder is read
 * as "the SELECTED dashboard has been fetched" — see
 * `waitForDashboardResponse`. A naive "at least 2 responses" reading is wrong:
 * measured on the jar, "can search and select a dashboard" produces exactly ONE
 * `/api/dashboard/:id` fetch, because the dashboard it picks in the modal is
 * already the wizard's default selection, so re-picking it fires nothing.
 */
export function captureWizardDashboardResponses(page: Page): Response[] {
  const responses: Response[] = [];

  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      DASHBOARD_PATH_RE.test(new URL(response.url()).pathname)
    ) {
      responses.push(response);
    }
  });

  return responses;
}

export async function waitForDashboardResponse(
  responses: Response[],
  dashboardId: number,
) {
  await expect
    .poll(
      () =>
        responses.some(
          (response) =>
            new URL(response.url()).pathname === `/api/dashboard/${dashboardId}`,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Port of `cy.intercept("GET", "api/preview_embed/dashboard/*").as("previewEmbed")`
 * plus the later `cy.wait("@previewEmbed").then(({ request }) => …)`. Same
 * retroactive shape as above — the intercept is registered at the top of the
 * test and read many preview renders later — so it is ported as a passive
 * request recorder, matching `capturePreviewEmbedRequests` in the guest-embed
 * port.
 */
export function capturePreviewEmbedDashboardRequests(page: Page): Request[] {
  const requests: Request[] = [];

  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname.startsWith("/api/preview_embed/dashboard/")
    ) {
      requests.push(request);
    }
  });

  return requests;
}
