/**
 * Helpers for the dashboard-filters-auto-apply spec port
 * (dashboard-filters-auto-apply.cy.spec.js). New helpers live here
 * (parallel-agent rule: no edits to shared modules — the shared dashboard /
 * dashboard-parameters / dashboard-filters-2 helpers are imported read-only by
 * the spec). Ports of:
 * - H.applyFilterToast / H.applyFilterButton / H.cancelFilterButton
 *   (e2e-dashboard-helpers.ts) — the auto_apply_filters=false toast controls.
 *   Scope-taking so the full-app-embedding test can pass the iframe FrameLocator.
 * - a card-scoped H.assertTableRowsCount that accepts any card Locator (the
 *   embedded / public / frame cases wrap it in getDashboardCard(i).within(...);
 *   dashboard-filters-2's assertDashcardRowsCount is Page-only).
 * - the cy.intercept("@cardQuery") waits, one per dashcard-query endpoint
 *   (app POST, public GET, embed GET): register BEFORE the trigger (rule 2).
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page, Response } from "@playwright/test";

type Scope = Page | FrameLocator | Locator;

/** Port of H.applyFilterToast (cy.findByTestId("filter-apply-toast")). */
export function applyFilterToast(scope: Scope): Locator {
  return scope.getByTestId("filter-apply-toast");
}

/** Port of H.applyFilterButton (applyFilterToast().button("Apply")). */
export function applyFilterButton(scope: Scope): Locator {
  return applyFilterToast(scope).getByRole("button", {
    name: "Apply",
    exact: true,
  });
}

/** Port of H.cancelFilterButton (applyFilterToast().button("Cancel")). */
export function cancelFilterButton(scope: Scope): Locator {
  return applyFilterToast(scope).getByRole("button", {
    name: "Cancel",
    exact: true,
  });
}

/**
 * Card-scoped port of H.assertTableRowsCount: some rows rendered (virtualization
 * makes the visible count unreliable) + the table's data-rows-count attribute.
 * Mirrors assertCardTableRowsCount in dashboard-filters-2.ts, but takes any card
 * Locator so it works for a page card, an embedded card, or a frame card.
 */
export async function assertCardRowsCount(card: Locator, value: number) {
  if (value > 0) {
    await expect(
      card.getByTestId("table-body").getByRole("row").first(),
    ).toBeVisible();
  }
  await expect(card.getByTestId("table-root")).toHaveAttribute(
    "data-rows-count",
    String(value),
  );
}

/**
 * Register a wait for the next app dashcard-query response
 * (POST /api/dashboard/:id/dashcard/:id/card/:id/query — the "@cardQuery"
 * alias). Register BEFORE the action that triggers the re-query, await after.
 */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The public-dashboard variant of the "@cardQuery" alias
 * (GET /api/public/dashboard/:uuid/dashcard/:id/card/:id). */
export function waitForPublicCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/public\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/** The signed-embed variant of the "@cardQuery" alias
 * (GET /api/embed/dashboard/:token/dashcard/:id/card/:id). */
export function waitForEmbedCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/embed\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+$/.test(
        new URL(response.url()).pathname,
      ),
  );
}
