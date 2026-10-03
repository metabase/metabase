/**
 * Helpers for the progress-bar visualization spec port
 * (visualizations-charts/progress-bar.cy.spec.js).
 *
 * Kept in its own module so the shared support/*.ts files stay untouched; the
 * spec imports its shared helpers (vizSettingsSidebar, popover, icon, …)
 * read-only from the canonical modules.
 */
import type { Locator } from "@playwright/test";

/**
 * The chevron dropdown toggle inside the "Goal" setting row. Cypress:
 * `findByText("Goal").parent().parent().icon("chevrondown")`. `getByText`
 * with a string is an exact match here (testing-library `findByText` string
 * semantics per port rule 1).
 */
export function goalColumnDropdown(sidebar: Locator): Locator {
  return sidebar
    .getByText("Goal", { exact: true })
    .locator("../..")
    .locator(".Icon-chevrondown");
}
