/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filter-defaults.cy.spec.ts
 *
 * These are the spec's two top-level `const` functions. Everything else the
 * spec needs (createQuestionAndDashboard / editDashboardCard /
 * visitDashboardWithParams / filterWidget / clearFilterWidget / editDashboard /
 * saveDashboard / sidebar) is imported read-only from the shared modules.
 *
 * The default-value widget's trigger carries aria-label "No default" (its
 * placeholder is passed straight through as the aria-label — see
 * ParameterValueWidget.tsx `ariaLabel={placeholder}`), and keeps that label
 * even once a value is set. That's why both helpers locate it the same way.
 */
import type { Page } from "@playwright/test";

import { sidebar } from "./dashboard";
import { icon, popover } from "./ui";

/**
 * Port of the spec-local clearDefaultFilterValue:
 * `cy.findByLabelText("No default").parent().icon("close").click()`.
 * Scoped to the sidebar, matching the Cypress `sidebar().within` context the
 * call runs in.
 */
export async function clearDefaultFilterValue(page: Page) {
  const trigger = sidebar(page).getByLabel("No default", { exact: true });
  await icon(trigger.locator(".."), "close").click();
}

/**
 * Port of the spec-local setDefaultFilterValue: open the default-value picker
 * from the sidebar, type the value, and confirm. findByPlaceholderText is exact
 * in testing-library → { exact: true }; pressSequentially (not fill) so the
 * value-entry widget reacts to real keystrokes (PORTING rule 5).
 */
export async function setDefaultFilterValue(page: Page, value: string) {
  await sidebar(page).getByLabel("No default", { exact: true }).click();

  const pop = popover(page).first();
  await pop
    .getByPlaceholder("Enter some text", { exact: true })
    .pressSequentially(value);
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
}
