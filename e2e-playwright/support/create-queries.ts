/**
 * Helpers for the create-queries permissions port
 * (e2e/test/scenarios/permissions/create-queries.cy.spec.js).
 *
 * Ports of the data-permission UI helpers from
 * e2e/support/helpers/e2e-permissions-helpers.js. `modifyPermission` and the
 * modal/popover locators are reused read-only from the existing support
 * modules; the row/table/sidebar helpers below have no shared home yet, so
 * they live here.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
export const ALL_USERS_GROUP = 1;

/** The spec's NATIVE_QUERIES_PERMISSION_INDEX (the create-queries column). */
export const NATIVE_QUERIES_PERMISSION_INDEX = 0;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Port of cy.findByTestId("permission-table"). */
export function permissionTable(page: Page): Locator {
  return page.getByTestId("permission-table");
}

/**
 * Port of getPermissionRowPermissions: the `permissions-select` cells for the
 * row whose text contains `item`. cy.contains is a case-sensitive, first-match
 * substring, so filter on a case-sensitive regex and take the first row.
 */
export function getPermissionRowPermissions(page: Page, item: string): Locator {
  const row = permissionTable(page)
    .locator("tbody > tr")
    .filter({ hasText: new RegExp(escapeRegExp(item)) })
    .first();
  return row.getByTestId("permissions-select");
}

/** Port of H.selectPermissionRow: click the row's permission-index-th cell. */
export async function selectPermissionRow(
  page: Page,
  item: string,
  permissionIndex: number,
) {
  await getPermissionRowPermissions(page, item).nth(permissionIndex).click();
}

/**
 * Port of H.selectSidebarItem: cy.findAllByRole("menuitem").contains(item) —
 * case-sensitive substring, first match.
 */
export async function selectSidebarItem(page: Page, item: string) {
  await page
    .getByRole("menuitem")
    .filter({ hasText: new RegExp(escapeRegExp(item)) })
    .first()
    .click();
}

/**
 * Port of H.assertPermissionTable: assert the tbody row count, then every
 * row's permission cells exactly match. have.text is an exact (trimmed,
 * whitespace-collapsed) match → toHaveText.
 */
export async function assertPermissionTable(
  page: Page,
  rows: string[][],
) {
  await expect(permissionTable(page).locator("tbody > tr")).toHaveCount(
    rows.length,
  );

  for (const [item, ...permissions] of rows) {
    const cells = getPermissionRowPermissions(page, item);
    for (let index = 0; index < permissions.length; index++) {
      await expect(cells.nth(index)).toHaveText(permissions[index]);
    }
  }
}

/**
 * Port of cy.findByTextEnsureVisible("Sample Database").click() used to drill
 * from a database row into its tables — scoped to the permission table so it
 * hits the row cell (the only "Sample Database" on the group-view page).
 */
export async function drillIntoDatabaseRow(page: Page, name: string) {
  const cell = permissionTable(page).getByText(name, { exact: true });
  await expect(cell).toBeVisible();
  await cell.click();
}
