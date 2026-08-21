/**
 * Helpers for the official-collections port
 * (e2e/test/scenarios/organization/official-collections.cy.spec.js).
 *
 * Ports of the spec-local helpers and the two `H` helpers that have no shared
 * equivalent yet:
 * - createOfficialCollection: H.createCollection with an `authority_level`
 *   (the shared createCollection ports in dashboard-core / collections-* drop
 *   authority_level, so a dedicated helper lives here rather than editing them).
 * - getPartialPremiumFeatureError: H.getPartialPremiumFeatureError
 *   (e2e-enterprise-helpers.js) — the 402 error body shape the API gate asserts.
 *
 * Icon notes:
 * - `cy.icon("official_collection" | "folder")` → the class-based `icon()`
 *   helper (`.Icon-<name>`), which is what cy.icon resolves. These per-class
 *   icon selectors are stable on the jar bundle (unlike CSS-module classes).
 * - `cy.icon(name).should("exist" | "not.exist")` → toHaveCount(≥1)/toHaveCount(0);
 *   `.should("be.visible")` on an icon is an ANY-match (PORTING rule 3) →
 *   `.filter({ visible: true }).first()`.
 */
import { Locator, Page, expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getCollectionActions } from "./collections-cleanup";
import { deleteToken } from "./admin-extras";
import { createDashboard, createQuestion, createQuestionAndDashboard } from "./factories";
import { commandPaletteSearch } from "./search-pagination";
import { startNewCollectionFromSidebar } from "./command-palette";
import { openCollectionMenu } from "./collections-core";
import { SAMPLE_DATABASE } from "./sample-data";
import { icon, modal, navigationSidebar, popover } from "./ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

export const COLLECTION_NAME = "Official Collection Test";

export const TEST_QUESTION_QUERY = {
  "source-table": ORDERS_ID,
  aggregation: [["count"]],
  breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }]],
};

/**
 * Port of H.getPartialPremiumFeatureError (e2e-enterprise-helpers.js): the
 * partial 402 error body. Asserted with toMatchObject (Cypress `deep.include`).
 */
export function getPartialPremiumFeatureError(name: string) {
  const message = `${name} is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/`;
  return {
    cause: message,
    data: {
      "status-code": 402,
      status: "error-premium-feature-not-available",
    },
    message,
    status: "error-premium-feature-not-available",
  };
}

/** Port of H.createCollection({ authority_level }): POST /api/collection. */
export async function createOfficialCollection(
  api: MetabaseApi,
  name: string,
): Promise<{ id: number }> {
  const response = await api.post("/api/collection", {
    name,
    authority_level: "official",
  });
  return (await response.json()) as { id: number };
}

/** Port of the spec-local openCollection. findByText is exact. */
export async function openCollection(page: Page, collectionName: string) {
  await navigationSidebar(page)
    .getByText(collectionName, { exact: true })
    .click();
}

/**
 * Port of the spec-local createAndOpenOfficialCollection: create an official
 * collection through the new-collection modal, then open it from the sidebar.
 */
export async function createAndOpenOfficialCollection(
  page: Page,
  { name }: { name: string },
) {
  await startNewCollectionFromSidebar(page);
  const dialog = modal(page);
  await dialog
    .getByPlaceholder("My new fantastic collection")
    .fill(name);
  // The collection-type control is a Mantine SegmentedControl: its inner label
  // span intercepts pointer events, so a real click on the "Official" option
  // times out. Force-click — it still lands on the label/radio (the intercepting
  // span is a child of the label, so the change handler fires).
  await dialog.getByText("Official", { exact: true }).click({ force: true });
  await dialog.getByText("Create", { exact: true }).click();
  await navigationSidebar(page).getByText(name, { exact: true }).click();
}

/** Port of the spec-local changeCollectionTypeTo. */
export async function changeCollectionTypeTo(
  page: Page,
  type: "official" | "regular",
) {
  await openCollectionMenu(page);
  const menu = popover(page);
  if (type === "official") {
    await menu.getByText("Make collection official", { exact: true }).click();
  } else {
    await menu.getByText("Remove Official badge", { exact: true }).click();
  }
}

/** Port of the spec-local assertNoCollectionTypeInput. */
export async function assertNoCollectionTypeInput(page: Page) {
  await expect(page.getByText(/Collection type/i)).toHaveCount(0);
  await expect(page.getByText("Regular", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Official", { exact: true })).toHaveCount(0);
}

/** Port of the spec-local assertHasCollectionTypeInput. */
export async function assertHasCollectionTypeInput(page: Page) {
  await expect(page.getByText(/Collection type/i)).not.toHaveCount(0);
  await expect(page.getByText("Regular", { exact: true })).not.toHaveCount(0);
  await expect(page.getByText("Official", { exact: true })).not.toHaveCount(0);
}

/**
 * Port of the spec-local assertNoCollectionTypeOption. `scope` mirrors the two
 * call sites — one page-wide (menu already open), one inside H.popover().
 */
export async function assertNoCollectionTypeOption(scope: Page | Locator) {
  await expect(
    scope.getByText("Make collection official", { exact: true }),
  ).toHaveCount(0);
  await expect(
    scope.getByText("Remove Official badge", { exact: true }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local assertSidebarIcon: the collection's sidebar row (the
 * text's immediate parent) contains the expected icon. `cy.icon(name)` with no
 * assertion is an implicit exist → toHaveCount(≥1).
 */
export async function assertSidebarIcon(
  page: Page,
  collectionName: string,
  expectedIcon: string,
) {
  const row = navigationSidebar(page)
    .getByText(collectionName, { exact: true })
    .locator("xpath=..");
  await expect(icon(row, expectedIcon)).not.toHaveCount(0);
}

/**
 * Port of the spec-local assertSearchResultBadge: within the search-app, the
 * result item for `itemName` carries (or doesn't) the official_collection icon.
 * For the collection result the name is disambiguated with the
 * `search-result-item-name` testid (the collection name also appears as the
 * question/dashboard results' location label). `has` locators are page-anchored
 * (PORTING collections gotcha).
 */
export async function assertSearchResultBadge(
  page: Page,
  itemName: string,
  {
    expectBadge,
    useNameTestId = false,
  }: { expectBadge: boolean; useNameTestId?: boolean },
) {
  const searchApp = page.getByTestId("search-app");
  const nameMatch = useNameTestId
    ? page.getByTestId("search-result-item-name").getByText(itemName, {
        exact: true,
      })
    : page.getByText(itemName, { exact: true });
  const resultItem = searchApp
    .getByTestId("search-result-item")
    .filter({ has: nameMatch })
    .first();
  const badge = icon(resultItem, "official_collection");
  if (expectBadge) {
    await expect(badge).not.toHaveCount(0);
  } else {
    await expect(badge).toHaveCount(0);
  }
}

/** Port of the spec-local assertHasCollectionBadgeInNavbar. */
export async function assertHasCollectionBadgeInNavbar(
  page: Page,
  expectBadge = true,
) {
  const scope = page
    .locator("header")
    .getByText(COLLECTION_NAME, { exact: true })
    .locator("xpath=..");
  const badge = icon(scope, "official_collection");
  if (expectBadge) {
    // cy.icon(...).should("be.visible") is an ANY-match (PORTING rule 3).
    await expect(badge.filter({ visible: true }).first()).toBeVisible();
  } else {
    await expect(badge).toHaveCount(0);
  }
}

/**
 * Port of testOfficialBadgeInSearch: one search query, then assert the badge
 * presence on the collection / question / dashboard results.
 */
export async function testOfficialBadgeInSearch(
  page: Page,
  {
    searchQuery,
    collection,
    dashboard,
    question,
    expectBadge,
  }: {
    searchQuery: string;
    collection: string;
    dashboard: string;
    question: string;
    expectBadge: boolean;
  },
) {
  await commandPaletteSearch(page, searchQuery);

  await assertSearchResultBadge(page, collection, {
    expectBadge,
    useNameTestId: true,
  });
  await assertSearchResultBadge(page, question, { expectBadge });
  await assertSearchResultBadge(page, dashboard, { expectBadge });
}

/** Port of the module-level testOfficialBadgePresence. */
export async function testOfficialBadgePresence(
  page: Page,
  api: MetabaseApi,
  expectBadge = true,
) {
  const collection = await createOfficialCollection(api, COLLECTION_NAME);
  const collectionId = collection.id;
  await createQuestion(api, {
    name: "Official Question",
    collection_id: collectionId,
    query: TEST_QUESTION_QUERY,
  });
  await createDashboard(api, {
    name: "Official Dashboard",
    collection_id: collectionId,
  });

  if (!expectBadge) {
    await deleteToken(api);
  }
  await page.goto(`/collection/${collectionId}`);

  // Dashboard Page
  await page.getByText("Official Dashboard", { exact: true }).click();
  await assertHasCollectionBadgeInNavbar(page, expectBadge);

  // Question Page
  await page
    .locator("header")
    .getByText(COLLECTION_NAME, { exact: true })
    .click();
  await page.getByText("Official Question", { exact: true }).click();
  await assertHasCollectionBadgeInNavbar(page, expectBadge);

  // Search
  await testOfficialBadgeInSearch(page, {
    searchQuery: "Official",
    collection: COLLECTION_NAME,
    dashboard: "Official Dashboard",
    question: "Official Question",
    expectBadge,
  });
}

/** Port of the module-level testOfficialQuestionBadgeInRegularDashboard. */
export async function testOfficialQuestionBadgeInRegularDashboard(
  page: Page,
  api: MetabaseApi,
  expectBadge = true,
) {
  const collection = await createOfficialCollection(api, COLLECTION_NAME);
  await createQuestionAndDashboard(api, {
    questionDetails: {
      name: "Official Question",
      collection_id: collection.id,
      query: TEST_QUESTION_QUERY,
    },
    dashboardDetails: { name: "Regular Dashboard" },
  });

  if (!expectBadge) {
    await deleteToken(api);
  }

  await page.goto("/collection/root");
  await page.getByText("Regular Dashboard", { exact: true }).click();

  const gridBadge = icon(
    page.getByTestId("dashboard-grid"),
    "official_collection",
  );
  if (expectBadge) {
    await expect(gridBadge).not.toHaveCount(0);
  } else {
    await expect(gridBadge).toHaveCount(0);
  }
}

/** getCollectionActions re-exported for the spec (H.getCollectionActions). */
export { getCollectionActions };
