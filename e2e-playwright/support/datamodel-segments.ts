/**
 * Helpers for the admin data-model segments spec port
 * (e2e/test/scenarios/admin/datamodel/segments.cy.spec.ts).
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules (ui.ts, etc.) and does not edit them.
 *
 * Snowplow helpers → no-op stubs (PORTING rule 6; no snowplow-micro in the
 * spike harness). The UI actions still fire, only the assertions are stubbed.
 * TODO: wire snowplow-micro to make these real.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { icon } from "./ui";

// === Snowplow stubs (PORTING rule 6) ================================
export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

// === Segment list ===================================================

export function segmentListApp(page: Page): Locator {
  return page.getByTestId("segment-list-app");
}

/**
 * The <tr> in the segment list containing the given segment name. Cypress
 * navigated up N parents from the name text then found the ellipsis; scoping to
 * the row is the robust equivalent. The list renders as a semantic table (the
 * revision test uses `cy.get("tr")`).
 */
export function segmentRow(page: Page, name: string): Locator {
  return segmentListApp(page).getByRole("row").filter({ hasText: name });
}

/** The hover-independent row ellipsis (`.Icon-ellipsis`, a stable Icon class). */
export function segmentRowMenuTrigger(page: Page, name: string): Locator {
  return icon(segmentRow(page, name), "ellipsis");
}

export async function openSegmentRowMenu(page: Page, name: string) {
  await segmentRowMenuTrigger(page, name).click();
}

// === Revision history ==============================================

/**
 * Port of the spec-local assertRevisionHistory. `scope` is the segment-revisions
 * container. `.should("contain", ...)` is a case-sensitive substring →
 * toContainText.
 */
export async function assertRevisionHistory(scope: Locator, segmentName: string) {
  const revisions = scope.getByRole("listitem");
  await expect(revisions).toHaveCount(2);
  await expect(revisions.first()).toContainText("You edited the description");
  await expect(revisions.first()).toContainText("Foo");
  await expect(revisions.last()).toContainText(`You created "${segmentName}"`);
  await expect(revisions.last()).toContainText(
    "All orders with a total under $100.",
  );
}

// === Metadata request tracking =====================================

/**
 * Attach a counter for GET /api/table/:id/query_metadata responses — the
 * wait-free side of the Cypress `cy.wait(["@metadata", "@metadata",
 * "@metadata"])`. Attach a FRESH tracker BEFORE each navigation (the closure
 * only counts responses seen after it was created), then
 * `await expect.poll(tracker).toBeGreaterThanOrEqual(3)` after.
 */
export function trackMetadataRequests(page: Page): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /\/api\/table\/\d+\/query_metadata/.test(new URL(response.url()).pathname)
    ) {
      count += 1;
    }
  });
  return () => count;
}
