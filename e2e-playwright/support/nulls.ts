/**
 * Helpers for the nulls spec port
 * (e2e/test/scenarios/question/nulls.cy.spec.js):
 * - findGridcell: the spec-local `cy.findByRole("grid").findByRole("gridcell", { name })`.
 * - nextCell: the jQuery `.next()` used to reach the (empty) discount cell that
 *   sits immediately after the total cell.
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9). Everything else the spec needs is imported read-only
 * from the shared modules.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Port of the spec-local `findGridcell(text)`:
 * `cy.findByRole("grid").findByRole("gridcell", { name: text })`. findByRole
 * name strings are exact matches in testing-library → `exact: true` (PORTING
 * rule 1).
 */
export function findGridcell(page: Page, text: string): Locator {
  return page
    .getByRole("grid")
    .getByRole("gridcell", { name: text, exact: true });
}

/**
 * Port of jQuery `.next()` on a gridcell: the immediately-following sibling
 * cell in the same row. The spec uses it to hop from the "39.72" total cell to
 * the (empty) discount cell.
 */
export function nextCell(cell: Locator): Locator {
  return cell.locator("xpath=following-sibling::*[1]");
}
