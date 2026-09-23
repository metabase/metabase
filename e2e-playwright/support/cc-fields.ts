/**
 * Helpers for cc-fields.spec.ts — the one piece of the custom-column field
 * resolution spec that the shared modules don't already cover.
 *
 * Lives in its own file so the shared support modules stay untouched. The
 * CodeMirror editor helpers (type/clear/format/value) and enterCustomColumnDetails
 * are imported read-only from custom-column-3.ts / notebook.ts.
 */
import type { Page } from "@playwright/test";

/**
 * Port of H.addCustomColumn (e2e-bi-basics-helpers.js → initiateAction):
 * cy.findAllByTestId("action-buttons").find(".Icon-add_data").click(). A
 * single-stage query has one action-buttons row, so `.first()` mirrors the
 * unscoped Cypress find.
 */
export async function addCustomColumn(page: Page) {
  await page
    .getByTestId("action-buttons")
    .locator(".Icon-add_data")
    .first()
    .click();
}
