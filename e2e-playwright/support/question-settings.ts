/**
 * Helpers for the question settings spec port
 * (e2e/test/scenarios/question/settings.cy.spec.js):
 * - openOrdersTable / browseDatabases (`H` helpers not yet in shared modules)
 * - the in-spec sidebar-column helpers (getSidebarColumns,
 *   getVisibleSidebarColumns, hideColumn)
 *
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9).
 */
import type { Locator, Page } from "@playwright/test";

import { openTable } from "./binning";
import { sidebar } from "./dashboard";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE } from "./sample-data";
import { navigationSidebar } from "./ui";

/** Port of H.openOrdersTable (simple mode only — all this spec needs). */
export async function openOrdersTable(page: Page) {
  await openTable(page, { table: SAMPLE_DATABASE.ORDERS_ID });
}

/** Port of H.browseDatabases. */
export function browseDatabases(page: Page): Locator {
  return navigationSidebar(page).getByLabel("Browse databases", {
    exact: true,
  });
}

/**
 * Port of the spec's getSidebarColumns: all column rows (visible and
 * hidden) in the table-columns section of the viz settings sidebar. The
 * Cypress helper scrollIntoView'd the container first.
 */
export async function getSidebarColumns(page: Page): Promise<Locator> {
  const container = page.getByTestId("chart-settings-table-columns");
  await container.scrollIntoViewIfNeeded();
  await expect(container).toBeVisible();
  return container.getByRole("listitem");
}

/** Port of the spec's getVisibleSidebarColumns. */
export function getVisibleSidebarColumns(page: Page): Locator {
  return page.getByTestId("visible-columns").getByRole("listitem");
}

/**
 * Port of the spec's findColumnAtIndex (negative indices count from the
 * end, like Cypress .eq). The count + nth pair is re-resolved until the
 * assertion holds, mirroring Cypress's retry of the whole query chain.
 */
export async function findColumnAtIndex(
  page: Page,
  columnName: string,
  index: number,
): Promise<Locator> {
  const columns = getVisibleSidebarColumns(page);
  const resolve = async () => {
    const count = await columns.count();
    return columns.nth(index < 0 ? count + index : index);
  };
  await expect(async () => {
    await expect(await resolve()).toContainText(columnName, { timeout: 1000 });
  }).toPass();
  return resolve();
}

// moveDnDKitElementSynthetic is now canonical in ./dnd; re-exported so this
// module's consumers keep their import unchanged.
export { moveDnDKitElementSynthetic } from "./dnd";

/**
 * Port of the spec's hideColumn. Like the Cypress original, no force —
 * let actionability checks wait out re-renders.
 */
export async function hideColumn(page: Page, name: string) {
  await sidebar(page)
    .getByTestId(`draggable-item-${name}`)
    .getByTestId(`${name}-hide-button`)
    .click();
}
