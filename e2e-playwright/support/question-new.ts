/**
 * Helpers for the question-new spec port — `H` helpers and cy commands not
 * yet in the shared modules:
 * - e2e-ui-elements-helpers.js (miniPickerHeader, entityPickerModalItem,
 *   collectionOnTheGoModal, tableInteractiveBody)
 * - e2e-misc-helpers.js (checkSavedToCollectionQuestionToast)
 * - e2e-collection-helpers.ts (visitCollection, getPersonalCollectionName)
 * - e2e-permissions-helpers.js (selectPermissionRow)
 * - e2e/support/commands/database/addSQLiteDatabase.js
 *
 * Kept separate from the shared support/*.ts files because those are edited
 * by parallel porting agents; fold into notebook.ts/ui.ts when consolidating.
 */
import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { undoToast } from "./metrics";
import { entityPickerModalLevel } from "./notebook";

/** Not in support/sample-data.ts, so it's looked up here the same way. */
export const SECOND_COLLECTION_ID = findCollectionId("Second collection");

/**
 * Port of H.getPersonalCollectionName(USERS.nocollection): the nocollection
 * user is "No Collection Tableton" in e2e/support/cypress_data.js.
 */
export const NOCOLLECTION_PERSONAL_COLLECTION_NAME =
  "No Collection Tableton's Personal Collection";

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (collection) => collection.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

/** Port of H.miniPickerHeader(). */
export function miniPickerHeader(page: Page): Locator {
  return page.getByTestId("mini-picker-header");
}

/** Port of H.tableInteractiveBody(). */
export function tableInteractiveBody(page: Page): Locator {
  return page.getByTestId("table-body");
}

/** Port of H.collectionOnTheGoModal(). */
export function collectionOnTheGoModal(page: Page): Locator {
  return page.getByTestId("create-collection-on-the-go");
}

/**
 * Port of H.entityPickerModalItem(level, name):
 * findByText(name, { ignore: '[data-testid="picker-item-location"]' })
 * .parents("a"). Search/recents rows repeat the parent collection name
 * inside [data-testid="picker-item-location"], so exclude it, then walk up
 * to the Mantine NavLink anchor (which carries the data-active attribute).
 */
export function entityPickerModalItem(
  page: Page,
  level: number,
  name: string | RegExp,
): Locator {
  return entityPickerModalLevel(page, level)
    .getByText(name, { exact: typeof name === "string" })
    .and(page.locator(':not([data-testid="picker-item-location"] *)'))
    .locator("xpath=ancestor-or-self::a[1]");
}

/** Port of H.checkSavedToCollectionQuestionToast. */
export async function checkSavedToCollectionQuestionToast(
  page: Page,
  addToDashboard = false,
) {
  const toast = undoToast(page);
  await expect(toast.getByText(/Saved/i)).toBeVisible();
  if (addToDashboard) {
    await toast
      .getByRole("button", { name: /Add this to a dashboard/i })
      .click();
  }
}

/**
 * Port of H.selectPermissionRow: click the permissionIndex-th permission
 * select in the first permission-table row containing `item` (Cypress
 * .contains() is first-match, case-sensitive substring — hence the regex
 * and .first()).
 */
export async function selectPermissionRow(
  page: Page,
  item: string,
  permissionIndex: number,
) {
  await page
    .getByTestId("permission-table")
    .locator("tbody > tr")
    .filter({ hasText: new RegExp(escapeRegExp(item)) })
    .first()
    .getByTestId("permissions-select")
    .nth(permissionIndex)
    .click();
}

/**
 * Port of H.visitCollection: navigate and wait for both collection-items
 * requests (pinned + unpinned) to complete, counting responses via a page
 * listener since two waitForResponse calls with the same predicate would
 * both resolve on the first response.
 */
export async function visitCollection(page: Page, id: number | string) {
  const pathname = `/api/collection/${id}/items`;
  let seen = 0;
  const twoItemLoads = new Promise<void>((resolve) => {
    const handler = (response: Response) => {
      const url = new URL(response.url());
      // The Cypress alias pattern is `/items?**`, i.e. requires a query string.
      if (url.pathname === pathname && url.search.length > 0) {
        seen += 1;
        if (seen === 2) {
          page.off("response", handler);
          resolve();
        }
      }
    };
    page.on("response", handler);
  });
  await page.goto(`/collection/${id}`);
  await twoItemLoads;
}

/** Port of cy.addSQLiteDatabase. */
export async function addSQLiteDatabase(
  api: MetabaseApi,
  {
    name = "sqlite",
    auto_run_queries = true,
    is_full_sync = true,
  }: {
    name?: string;
    auto_run_queries?: boolean;
    is_full_sync?: boolean;
  } = {},
) {
  await api.post("/api/database", {
    engine: "sqlite",
    name,
    details: { db: "./resources/sqlite-fixture.db" },
    auto_run_queries,
    is_full_sync,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  });
}

/** Port of the spec-local logRecent(model, model_id). */
export async function logRecent(
  api: MetabaseApi,
  model: "collection" | "dashboard" | "table" | "card",
  model_id: number,
) {
  await api.post("/api/activity/recents", {
    context: "selection",
    model,
    model_id,
  });
}

/** Register a wait for the next POST /api/card response ("@createQuestion"). */
export function waitForCreateQuestion(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/** Register a wait for the next POST /api/dashboard response ("@createDashboard"). */
export function waitForCreateDashboard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dashboard",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
