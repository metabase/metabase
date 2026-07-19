/**
 * Helpers for the download-permissions port
 * (e2e/test/scenarios/permissions/download-permissions.cy.spec.js).
 *
 * New helpers only (PORTING.md rule 9). Everything else is imported read-only:
 * - `modifyPermission` from support/admin-permissions.ts (full upstream form)
 * - `updatePermissionsGraph` from support/dashboard-repros.ts (GET-merge-PUT)
 * - `popover`/`modal`/`icon`/`visitQuestion`/`visitDashboard` from support/ui.ts
 * - `downloadAndAssert` from support/downloads.ts
 * - `createNativeQuestion` from support/factories.ts
 * - table/db-id constants from support/sample-data.ts
 *
 * The three items below have no shared home:
 * - `sidebar` — H.sidebar (`cy.get("main aside")`), not previously needed by an
 *   admin-permissions port.
 * - `assertPermissionForItem` — the row-cell assertion from
 *   e2e-permissions-helpers.js (the create-queries port only needed the
 *   whole-table `assertPermissionTable`).
 * - `setDownloadPermissionsForProductsTable` — the spec-local function that
 *   grants download on every table except Products (or Products `limited`).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getPermissionRowPermissions } from "./create-queries";
import { updatePermissionsGraph } from "./dashboard-repros";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

export const DATA_ACCESS_PERMISSION_INDEX = 0;
export const DOWNLOAD_PERMISSION_INDEX = 2;

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
const ALL_USERS_GROUP = 1;

const {
  PRODUCTS_ID,
  ORDERS_ID,
  PEOPLE_ID,
  REVIEWS_ID,
  ACCOUNTS_ID,
  ANALYTIC_EVENTS_ID,
  FEEDBACK_ID,
  INVOICES_ID,
} = SAMPLE_DATABASE;

/** Port of H.sidebar (e2e-ui-elements-helpers.js): cy.get("main aside"). */
export function sidebar(page: Page): Locator {
  return page.locator("main aside");
}

/**
 * Port of H.assertPermissionForItem (e2e-permissions-helpers.js): the row's
 * `permissionColumnIndex`-th permission cell has exactly `permissionValue`.
 * `have.text` is an exact (trimmed, whitespace-collapsed) match → toHaveText.
 */
export async function assertPermissionForItem(
  page: Page,
  item: string,
  permissionColumnIndex: number,
  permissionValue: string,
) {
  await expect(
    getPermissionRowPermissions(page, item).nth(permissionColumnIndex),
  ).toHaveText(permissionValue);
}

/**
 * Port of the spec-local setDownloadPermissionsForProductsTable: grant All
 * Users the given download level on Products only, leaving every other table
 * on `full`.
 */
export async function setDownloadPermissionsForProductsTable(
  api: MetabaseApi,
  permission: "none" | "limited" | "full",
) {
  await updatePermissionsGraph(api, {
    [ALL_USERS_GROUP]: {
      [SAMPLE_DB_ID]: {
        download: {
          schemas: {
            PUBLIC: {
              [PRODUCTS_ID]: permission,
              [ORDERS_ID]: "full",
              [PEOPLE_ID]: "full",
              [REVIEWS_ID]: "full",
              [ACCOUNTS_ID]: "full",
              [ANALYTIC_EVENTS_ID]: "full",
              [FEEDBACK_ID]: "full",
              [INVOICES_ID]: "full",
            },
          },
        },
      },
    },
  });
}
