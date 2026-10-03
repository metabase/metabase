/**
 * Helpers for the dashboard-tabs spec port (dashboard/tabs.cy.spec.js):
 * the tab-editing H helpers no earlier port needed (visitDashboardAndCreateTab,
 * addLinkWhileEditing, dashboardCards), the sample-instance-data ids
 * support/sample-data.ts doesn't expose, and the spec-local factories /
 * assertion helpers (filter-mapping builders, filter-visibility assertions,
 * the dnd-kit tab reorder).
 *
 * New helpers for this port live here only (port rule 9).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { editBar, editDashboard, saveDashboard } from "./dashboard";
import { createNewTab } from "./dashboard-core";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { popover, visitDashboard } from "./ui";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

// === sample instance data lookups (cypress_sample_instance_data.js) ===

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find((q) => q.name === name);
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (c) => c.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");
export const ADMIN_PERSONAL_COLLECTION_ID = findCollectionId(
  "Bobby Tables's Personal Collection",
);
export const NORMAL_PERSONAL_COLLECTION_ID = findCollectionId(
  "Robert Tableton's Personal Collection",
);

// === tab-strip / dashcard container lookups ===

/** Port of H.dashboardCards (cy.get("[data-element-id=dashboard-cards-container]")). */
export function dashboardCards(page: Page): Locator {
  return page.locator("[data-element-id=dashboard-cards-container]");
}

// === composite navigation helpers (ports of e2e-dashboard-helpers.ts) ===

/**
 * Port of H.visitDashboardAndCreateTab: visit, enter edit mode, add a tab,
 * optionally save. Takes the api the shared visitDashboard needs.
 */
export async function visitDashboardAndCreateTab(
  page: Page,
  api: MetabaseApi,
  { dashboardId, save = true }: { dashboardId: number; save?: boolean },
) {
  await visitDashboard(page, api, dashboardId);
  await editDashboard(page);
  await createNewTab(page);
  if (save) {
    await saveDashboard(page);
  }
}

/**
 * Port of H.createNativeQuestionAndDashboard for the permission test, which
 * needs the card and the dashboard in DIFFERENT collections (the shared
 * dashboard-parameters.ts port doesn't thread collection_id onto the card).
 * Returns the dashboard id.
 */
export async function createNativeQuestionAndDashboardInCollections(
  api: MetabaseApi,
  {
    query,
    questionCollectionId,
    dashboardCollectionId,
  }: {
    query: string;
    questionCollectionId: number;
    dashboardCollectionId: number;
  },
): Promise<{ dashboardId: number }> {
  const cardResponse = await api.post("/api/card", {
    name: "test question",
    display: "table",
    visualization_settings: {},
    collection_id: questionCollectionId,
    dataset_query: {
      type: "native",
      native: { query },
      database: SAMPLE_DB_ID,
    },
  });
  const { id: cardId } = (await cardResponse.json()) as { id: number };

  const dashboardResponse = await api.post("/api/dashboard", {
    name: "Test Dashboard",
    collection_id: dashboardCollectionId,
  });
  const { id: dashboardId } = (await dashboardResponse.json()) as {
    id: number;
  };

  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      { id: -1, card_id: cardId, row: 0, col: 0, size_x: 11, size_y: 6 },
    ],
  });
  return { dashboardId };
}

/** Port of H.addLinkWhileEditing. */
export async function addLinkWhileEditing(page: Page, url: string) {
  await page.getByLabel("Add a link or iframe").click();
  await popover(page).getByText("Link", { exact: true }).click();
  await page.getByPlaceholder("https://example.com", { exact: true }).fill(url);
}

/**
 * Port of the spec's tab-drag (issue #34970). Cypress fires
 * mousedown → mousemove(clientX:11) → mousemove → wait(100) → mouseup on the
 * tab; the mousemove of >10px clears dnd-kit's mouseSensor
 * activationConstraint distance:10, and the final position (near the left
 * edge, x≈11) drops the tab into first place. Real mouse input drives the
 * dnd-kit sortable the same way (see dragOnXAxis in dashboard-core.ts).
 */
export async function reorderTabToStart(tab: Locator) {
  const page = tab.page();
  const box = await tab.boundingBox();
  if (!box) {
    throw new Error("Cannot drag a tab without a bounding box");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed the 10px activation threshold before the real move.
  await page.mouse.move(startX - 20, startY, { steps: 2 });
  // Land near the left edge so the long tab drops into first position.
  await page.mouse.move(11, startY, { steps: 10 });
  await page.mouse.move(11, startY);
  // Mirrors the .wait(100) the Cypress helper needed "to avoid flakiness".
  await page.waitForTimeout(100);
  await page.mouse.up();
  // Park the mouse away from the tab strip and let dnd-kit's pointer sensor
  // fully release: while a drag is settling the strip swallows the next real
  // click, so a Save clicked too soon focuses the button without saving (the
  // dashboard-core tab-drag test settles the same way). See
  // findings-inbox/dashboard-tabs.md.
  await page.mouse.move(startX, startY + 300);
  await page.waitForTimeout(1000);
}

// === filter-mapping factories (ports of the spec-local builders) ===

export const DASHBOARD_DATE_FILTER = {
  id: "1",
  name: "Date filter",
  slug: "filter-date",
  type: "date/month-year",
};

export const DASHBOARD_NUMBER_FILTER = {
  id: "2",
  name: "Number filter",
  slug: "filter-number",
  type: "number/=",
};

export const DASHBOARD_TEXT_FILTER = {
  id: "3",
  name: "Text filter",
  slug: "filter-text",
  type: "string/contains",
};

export const DASHBOARD_LOCATION_FILTER = {
  id: "4",
  name: "Location filter",
  slug: "filter-location",
  type: "string/=",
};

type FilterDef = { id: string; name: string; slug: string; type: string };

export function createTextFilterMapping({ card_id }: { card_id: number }) {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ];
  return {
    card_id,
    parameter_id: DASHBOARD_TEXT_FILTER.id,
    target: ["dimension", fieldRef],
  };
}

export function createDateFilterMapping({ card_id }: { card_id: number }) {
  const fieldRef = ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }];
  return {
    card_id,
    parameter_id: DASHBOARD_DATE_FILTER.id,
    target: ["dimension", fieldRef],
  };
}

export function createNumberFilterMapping({ card_id }: { card_id: number }) {
  const fieldRef = ["field", ORDERS.QUANTITY, { "base-type": "type/Number" }];
  return {
    card_id,
    parameter_id: DASHBOARD_NUMBER_FILTER.id,
    target: ["dimension", fieldRef],
  };
}

// === filter-visibility assertions ===

/**
 * Port of the spec-local assertFiltersVisibility.
 *
 * FAITHFUL, and deliberately so: the Cypress original passes an arrow function
 * as `cy.findByTestId`'s SECOND argument, where testing-library expects an
 * options object — so the `visible.forEach`/`hidden.forEach` bodies inside it
 * NEVER execute. Upstream this helper only ever asserted that the two widget
 * containers exist and toggled edit mode; the per-filter visibility checks are
 * dead code. Porting the *evident intent* instead (scoped per-filter
 * visibility) fails on the jar — the tab-1 "Text filter" is not shown, so the
 * intent never held. We do not have a cross-checkable baseline for the intent
 * (the assertions never ran), so restoring them would be manufacturing a
 * product-bug claim. Ported as the no-op it actually was; the
 * still-executing URL assertion (assertFilterValues) carries the real
 * coverage. See findings-inbox/dashboard-tabs.md.
 */
export async function assertFiltersVisibility(
  page: Page,
  _filters: { visible?: FilterDef[]; hidden?: FilterDef[] },
) {
  await expect(
    page.getByTestId("dashboard-parameters-widget-container"),
  ).toBeVisible();

  // Ensure the edit-mode container renders too (upstream toggled edit mode).
  await editDashboard(page);
  await expect(
    page.getByTestId("edit-dashboard-parameters-widget-container"),
  ).toBeVisible();

  await editBar(page).getByRole("button", { name: "Cancel", exact: true }).click();
}

/**
 * Port of the spec-local assertFilterValues: each filter's slug=value pair
 * must be present in the URL query string. Cypress's
 * `cy.location("search").should("contain", ...)` retries, so poll.
 */
export async function assertFilterValues(
  page: Page,
  filterValues: [FilterDef, string | number | undefined][],
) {
  for (const [filter, value] of filterValues) {
    const displayValue = value === undefined ? "" : value.toString();
    const filterQueryParameter = `${filter.slug}=${displayValue}`;
    await expect
      .poll(() => new URL(page.url()).search)
      .toContain(filterQueryParameter);
  }
}
