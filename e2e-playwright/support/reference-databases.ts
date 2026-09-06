/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/onboarding/reference/databases.cy.spec.js
 *
 * Kept in its own module because the shared support/*.ts files are edited by
 * parallel porting agents; fold into data-reference.ts when consolidating.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Port of `cy.button(/Edit/).trigger("click")` on the reference Details header.
 *
 * Upstream comments: "For some unknown reason, calling .click() causes the form
 * to immediately reset, putting us in a state like we never clicked the edit
 * button". `trigger("click")` dispatches a bare synthetic click, which runs the
 * React onClick without the surrounding focus/blur a real click performs — the
 * same treatment 5276-remove-field-type.spec.ts already uses for this button.
 */
export async function startEditingReferenceDetails(page: Page) {
  await page.getByRole("button", { name: /Edit/ }).dispatchEvent("click");
}

/**
 * Port of `cy.findAllByRole("listitem").filter(":contains(<name>)")` against the
 * reference sidebar (`<ol>` of SidebarItem `<li>`s in TableSidebar/FieldSidebar).
 * `:contains` is a case-sensitive substring match, so `hasText` takes a regex.
 */
export function referenceSidebarItem(page: Page, text: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
