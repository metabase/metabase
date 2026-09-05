/**
 * Helpers for the table-collection-permissions port
 * (e2e/test/scenarios/data-studio/table-collection-permissions.cy.spec.ts).
 *
 * New helpers only (PORTING.md rule 9). Everything else is imported read-only:
 * - `createLibrary` / `publishTables` / `activateToken` from support/api.ts
 * - `updatePermissionsGraph` / `sandboxTable` from support/dashboard-repros.ts
 * - `deleteToken` from support/admin-extras.ts
 * - `visitDataModel` / `TablePicker` from support/data-model.ts
 * - `createSegment` from support/filter-bulk.ts
 * - notebook/QB helpers from support/notebook.ts, `saveQuestion` from
 *   support/sharing.ts, `visitQuestionAdhoc` from support/permissions.ts,
 *   `visitQuestionAdhocNotebook` from support/joins.ts
 * - `main`/`modal`/`popover`/`newButton`/`collectionTable`/`sidebarSection`/
 *   `visitQuestion` from support/ui.ts, `tableInteractive` from support/models.ts,
 *   `undoToast` from support/metrics.ts, `cartesianChartCircles` from
 *   support/metrics.ts
 *
 * The four below have no shared home yet:
 * - `blockUserGroupPermissions` — H.blockUserGroupPermissions
 *   (e2e-permissions-helpers.js); no existing port.
 * - `sandboxProductsOnCategory` — the spec-local sandbox setup.
 * - `popoverByIndex` — the spec-local `H.popover().should("have.length", 2).eq(i)`.
 * - `assertQueryPermissionError` — the spec-local permission-error assertion.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { updatePermissionsGraph, sandboxTable } from "./dashboard-repros";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { main, popover } from "./ui";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/**
 * Port of H.blockUserGroupPermissions (e2e-permissions-helpers.js): block
 * view-data and create-queries for a group on a database.
 */
export async function blockUserGroupPermissions(
  api: MetabaseApi,
  groupId: number,
  databaseId: number = SAMPLE_DB_ID,
) {
  await updatePermissionsGraph(api, {
    [groupId]: {
      [databaseId]: {
        "view-data": "blocked",
        "create-queries": "no",
      },
    },
  });
}

/** Port of the spec-local sandboxProductsOnCategory. */
export async function sandboxProductsOnCategory(api: MetabaseApi) {
  await sandboxTable(api, {
    table_id: PRODUCTS_ID,
    attribute_remappings: {
      attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  });
}

/**
 * Port of the spec-local popoverByIndex:
 * `H.popover().should("have.length", 2).eq(index)`. The length assertion is
 * the gate that both popovers (the filter picker and its typeahead dropdown)
 * are open, so it is kept as a real assertion rather than folded away.
 */
export async function popoverByIndex(
  page: Page,
  index: number,
): Promise<Locator> {
  await expect(popover(page)).toHaveCount(2);
  return popover(page).nth(index);
}

/** Port of the spec-local assertQueryPermissionError. */
export async function assertQueryPermissionError(page: Page) {
  await expect(
    main(page).getByText(
      "Sorry, you don't have permission to run this query.",
      { exact: true },
    ),
  ).toBeVisible();
}
