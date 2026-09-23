/**
 * Helpers for the collections clean-up spec port
 * (e2e/test/scenarios/collections/cleanup.cy.spec.js).
 *
 * Ports the spec-local element/action/assertion helpers and the seed-data
 * builders (bulkCreateQuestions / bulkCreateDashboards / makeItemStale /
 * seedMainTestData). Lives in its own file so shared support modules stay
 * untouched (PORTING.md rule 9); content factories come from support/factories,
 * UI primitives from support/ui, selectDropdown from support/dashboard.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { selectDropdown } from "./dashboard";
import {
  type Card,
  type Dashboard,
  createDashboard,
  createQuestion,
} from "./factories";
import { icon, popover } from "./ui";

/**
 * The ORDERS table's static (snapshot-stable) id — mirrors
 * SAMPLE_DB_TABLES.STATIC_ORDERS_ID in e2e/support/cypress_data.js (untyped JS
 * outside tsconfig, so re-declared here).
 */
export const STATIC_ORDERS_ID = 5;

// === elements ===

/** Port of H.getCollectionActions (e2e-collection-helpers.ts). */
export function getCollectionActions(page: Page): Locator {
  return page.getByTestId("collection-menu");
}

/** Port of the spec-local collectionMenu: the collection-actions ellipsis. */
export function collectionMenu(page: Page): Locator {
  return icon(getCollectionActions(page), "ellipsis");
}

/** Port of the spec-local cleanUpModal (findAllByTestId — .first() as scope). */
export function cleanUpModal(page: Page): Locator {
  return page.getByTestId("cleanup-collection-modal").first();
}

/** Port of the spec-local closeCleanUpModal. */
export async function closeCleanUpModal(page: Page) {
  await page.getByTestId("cleanup-collection-modal-close-btn").first().click();
}

/** Port of the spec-local recursiveFilter (the sub-collections switch). */
export function recursiveFilter(page: Page): Locator {
  return page.getByLabel(/Include items in sub-collections/);
}

/** Port of the spec-local dateFilter. */
export function dateFilter(page: Page): Locator {
  return page.getByTestId("cleanup-date-filter");
}

/** Port of the spec-local pagination. */
export function pagination(page: Page): Locator {
  return page.getByTestId("cleanup-collection-modal-pagination");
}

/** Port of the spec-local emptyState. */
export function emptyState(page: Page): Locator {
  return page.getByText(/All items have been used in the past/);
}

/** Port of the spec-local errorState. */
export function errorState(page: Page): Locator {
  return page.getByText(/An error occurred/);
}

// === actions ===

/** Port of the spec-local selectCleanThingsUpCollectionAction. */
export async function selectCleanThingsUpCollectionAction(page: Page) {
  await expect(getCollectionActions(page)).toBeVisible();
  await collectionMenu(page).click();
  await popover(page).getByText("Clear out unused items", { exact: true }).click();
}

/** Port of the spec-local setDateFilter. findByText is exact. */
export async function setDateFilter(page: Page, timeSpan: string) {
  await dateFilter(page).click();
  await selectDropdown(page).getByText(timeSpan, { exact: true }).click();
}

/**
 * Port of the spec-local selectAllItems: click every per-row select cell.
 * Cypress used `.click({ multiple: true })` on findAllByTestId; only the row
 * cells carry data-testid="clean-up-table-check" (the header select-all is a
 * bare Checkbox), so this toggles each row on.
 */
export async function selectAllItems(page: Page) {
  const checks = cleanUpModal(page).getByTestId("clean-up-table-check");
  const count = await checks.count();
  for (let index = 0; index < count; index++) {
    await checks.nth(index).click();
  }
}

/** Port of the spec-local moveToTrash: the bulk-action toast's button. */
export async function moveToTrash(page: Page) {
  const toast = page.getByTestId("toast-card");
  await expect(toast).toBeVisible();
  await toast.getByText("Move to trash", { exact: true }).click();
}

// === assertions ===

/** Port of the spec-local assertNoPagination. */
export async function assertNoPagination(page: Page) {
  await expect(cleanUpModal(page).getByTestId(
    "cleanup-collection-modal-pagination",
  )).toHaveCount(0);
}

/** Port of the spec-local assertStaleItemCount. */
export async function assertStaleItemCount(page: Page, itemCount: number) {
  await expect(
    cleanUpModal(page).getByTestId("pagination-total").first(),
  ).toHaveText(`${itemCount}`);
}

// === seed-data helpers ===

type BulkOptions = { collection_id?: number | null } & Record<string, unknown>;

/**
 * Port of the spec-local bulkCreateQuestions: `amount` model-type questions
 * named "Bulk question N" (N counting down from `amount`, matching Cypress's
 * recursion). Returns them in creation order.
 */
export async function bulkCreateQuestions(
  api: MetabaseApi,
  amount: number,
  options: BulkOptions = {},
): Promise<Card[]> {
  const results: Card[] = [];
  for (let n = amount; n >= 1; n--) {
    const card = await createQuestion(api, {
      name: `Bulk question ${n}`,
      query: { "source-table": STATIC_ORDERS_ID },
      type: "model",
      ...options,
    });
    results.push(card);
  }
  return results;
}

/** Port of the spec-local bulkCreateDashboards: "Bulk dashboard N". */
export async function bulkCreateDashboards(
  api: MetabaseApi,
  amount: number,
  options: BulkOptions = {},
): Promise<Dashboard[]> {
  const results: Dashboard[] = [];
  for (let n = amount; n >= 1; n--) {
    const dashboard = await createDashboard(api, {
      name: `Bulk dashboard ${n}`,
      ...options,
    });
    results.push(dashboard);
  }
  return results;
}

/**
 * Port of makeItemStale: POST /api/testing/mark-stale to set an entity's
 * last-used date (defaults to 7 months ago on the backend when omitted).
 */
export function makeItemStale(
  api: MetabaseApi,
  id: number,
  model: "card" | "dashboard",
  dateString?: string,
) {
  return api.post("/api/testing/mark-stale", {
    id,
    model,
    ...(dateString ? { "date-str": dateString } : {}),
  });
}

/** Port of makeItemsStale: mark each id stale in sequence. */
export async function makeItemsStale(
  api: MetabaseApi,
  ids: number[],
  model: "card" | "dashboard",
  dateString?: string,
) {
  for (const id of ids) {
    await makeItemStale(api, id, model, dateString);
  }
}

export type Collection = { id: number } & Record<string, unknown>;

export type SeedData = {
  collection: Collection;
  notStaleItemCount: number;
  totalStaleItemCount: number;
  recursiveTotalItemCount: number;
};

/**
 * Port of the spec-local seedMainTestData. Builds a "Clean up test" collection
 * with 12 questions (4 very stale, 4 stale, 4 not stale) and 9 dashboards
 * (3/3/3), plus a child collection with 5 very-stale dashboards for the
 * recursive-filter case. Returns the count invariants the test asserts against.
 */
export async function seedMainTestData(api: MetabaseApi): Promise<SeedData> {
  const collection = await createCollectionViaApi(api, {
    name: "Clean up test",
  });

  const questions = await bulkCreateQuestions(api, 12, {
    collection_id: collection.id,
  });
  const veryStaleQuestionIds = questions.slice(0, 4).map((q) => q.id);
  const staleQuestionIds = questions.slice(4, 8).map((q) => q.id);
  const notStaleQuestionIds = questions.slice(8).map((q) => q.id);
  await makeItemsStale(api, veryStaleQuestionIds, "card", "2000-01-01");
  await makeItemsStale(api, staleQuestionIds, "card");

  const dashboards = await bulkCreateDashboards(api, 9, {
    collection_id: collection.id,
  });
  const veryStaleDashboardIds = dashboards.slice(0, 3).map((d) => d.id);
  const staleDashboardIds = dashboards.slice(3, 6).map((d) => d.id);
  const notStaleDashboardIds = dashboards.slice(6).map((d) => d.id);
  await makeItemsStale(api, veryStaleDashboardIds, "dashboard", "2000-01-01");
  await makeItemsStale(api, staleDashboardIds, "dashboard");

  const childCollection = await createCollectionViaApi(api, {
    name: "Child clean up test",
    parent_id: collection.id,
  });
  const childDashboards = await bulkCreateDashboards(api, 5, {
    collection_id: childCollection.id,
  });
  const veryStaleChildDashboardIds = childDashboards.map((d) => d.id);
  await makeItemsStale(api, veryStaleChildDashboardIds, "dashboard", "2000-01-01");

  const veryStaleItemCount =
    veryStaleQuestionIds.length + veryStaleDashboardIds.length;
  const staleItemCount = staleQuestionIds.length + staleDashboardIds.length;
  const notStaleItemCount =
    notStaleQuestionIds.length + notStaleDashboardIds.length;
  const totalStaleItemCount = veryStaleItemCount + staleItemCount;
  const recursiveTotalItemCount =
    veryStaleItemCount + staleItemCount + veryStaleChildDashboardIds.length;

  return {
    collection,
    notStaleItemCount,
    totalStaleItemCount,
    recursiveTotalItemCount,
  };
}

/** Port of H.createCollection (api/createCollection.ts), the subset used here. */
export async function createCollectionViaApi(
  api: MetabaseApi,
  details: { name: string; parent_id?: number | null },
): Promise<{ id: number } & Record<string, unknown>> {
  const response = await api.post("/api/collection", details);
  return (await response.json()) as { id: number };
}
