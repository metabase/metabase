/**
 * Helpers for the entity-picker spec port
 * (e2e/test/scenarios/organization/entity-picker.cy.spec.ts).
 *
 * Own module per PORTING rule 9 — the shared support files are edited by
 * parallel agents.
 *
 * Three picker-specific traps are baked in here:
 * - **Never press Enter to commit a search.** `SearchInput`
 *   (EntityPickerModal.tsx:228) debounces onChange 300ms and Enter submits the
 *   enclosing form, unmounting the picker before the debounce fires. So
 *   `enterSearchText` registers the `/api/search` wait, types, and awaits.
 * - **Parent→child clicks need pacing.** The tree column re-renders as children
 *   load, so a back-to-back click can land on a reconciled node that is still
 *   attached but is now a different row. `pickEntity` re-clicks in a `toPass`
 *   loop gated on the item's own `data-active` flipping.
 * - **Search results are VIRTUALIZED** (`VariableHeightVirtualizedList`), so
 *   `should("exist")` in the original only ever means "rendered". Upstream says
 *   as much in a comment ("just barely not visible. User must scroll down").
 *   The port keeps that semantic rather than scrolling.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { createDashboard, createQuestion } from "./factories";
import { FIRST_COLLECTION_ID, ORDERS_DASHBOARD_ID, SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const findCollectionId = (name: string): number => {
  const collection = (
    SAMPLE_INSTANCE_DATA.collections as { id: number | string; name: string }[]
  ).find((entity) => entity.name === name);
  if (!collection) {
    throw new Error(`Collection "${name}" not found in cypress_sample_instance_data`);
  }
  return Number(collection.id);
};

/** Ports of the *_PERSONAL_COLLECTION_ID exports (cypress_sample_instance_data.js). */
export const ADMIN_PERSONAL_COLLECTION_ID = findCollectionId(
  "Bobby Tables's Personal Collection",
);
export const NORMAL_PERSONAL_COLLECTION_ID = findCollectionId(
  "Robert Tableton's Personal Collection",
);
export const NO_COLLECTION_PERSONAL_COLLECTION_ID = findCollectionId(
  "No Collection Tableton's Personal Collection",
);

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js) — a fixed id. */
export const ALL_USERS_GROUP = 1;

/** WRITABLE_DB_ID (e2e/support/cypress_data.js). */
export const WRITABLE_DB_ID = 2;

/** The spec's module-level `cardDetails`. */
export const cardDetails = {
  name: "Question",
  type: "question" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

// === picker DOM ===

export function entityPickerModal(page: Page): Locator {
  return page.getByTestId("entity-picker-modal");
}

export function entityPickerModalLevel(page: Page, level: number): Locator {
  return page.getByTestId(`item-picker-level-${level}`);
}

/** Port of H.dashboardOnTheGoModal(). */
export function dashboardOnTheGoModal(page: Page): Locator {
  return page.getByTestId("create-dashboard-on-the-go");
}

/** Port of H.collectionOnTheGoModal(). */
export function collectionOnTheGoModal(page: Page): Locator {
  return page.getByTestId("create-collection-on-the-go");
}

/**
 * Port of H.entityPickerModalItem(level, name):
 * `findByText(name, { ignore: '[data-testid="picker-item-location"]' })
 * .parents("a")`. The `ignore` matters because search/recents rows repeat the
 * parent collection name inside `picker-item-location`.
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

/**
 * A single, PACED picker click. The column re-renders as children load, so a
 * back-to-back click can land on a reconciled node that is still attached and
 * still in place but is now a different row (PORTING: "a list that re-renders
 * under a resolved locator clicks the WRONG ROW"). Re-click in a `toPass` loop
 * gated on the row's own `data-active` — the same attribute the spec asserts
 * on directly elsewhere, so it is the app's own settled-state signal.
 */
export async function clickPickerItem(
  page: Page,
  level: number,
  name: string | RegExp,
) {
  const anchor = entityPickerModalItem(page, level, name).first();
  await expect(anchor).toBeVisible();
  await expect(async () => {
    await anchor.click({ timeout: 5_000 });
    await expect(anchor).toHaveAttribute("data-active", "true", {
      timeout: 3_000,
    });
  }).toPass({ timeout: 30_000 });
}

/**
 * Port of H.pickEntity — but paced (see clickPickerItem).
 *
 * `leaf: true` for paths whose final item closes the picker (a table in the
 * data picker, a dashboard in the save picker), where no post-click state
 * survives to assert on; that final click is issued plainly.
 */
export async function pickEntity(
  page: Page,
  {
    path,
    select,
    leaf = false,
  }: { path?: (string | RegExp)[]; select?: boolean; leaf?: boolean } = {},
) {
  if (path) {
    for (const [index, name] of path.entries()) {
      const isLast = index === path.length - 1;
      if (isLast && leaf) {
        const anchor = entityPickerModalItem(page, index, name).first();
        await expect(anchor).toBeVisible();
        await anchor.click();
      } else {
        await clickPickerItem(page, index, name);
      }
    }
  }

  if (select) {
    await page.getByTestId("entity-picker-select-button").click();
  }
}

// === search ===

const searchResponse = (page: Page, text: string) =>
  page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/search" && url.searchParams.get("q") === text
      );
    },
    { timeout: 15_000 },
  );

/**
 * Port of the spec-local enterSearchText:
 * `cy.findByPlaceholderText(placeholder).clear().type(text)`.
 *
 * `cy.type()` clicks its subject first, so the click is ported explicitly.
 * The `/api/search` wait is registered before typing and awaited after — never
 * Enter (see the module header). The await degrades to a no-op if RTK Query
 * answers the query from cache and no request is issued at all; the retrying
 * assertions that follow are the real gate either way.
 */
export async function enterSearchText(
  page: Page,
  options: { text: string; placeholder: string | RegExp },
) {
  const awaitSearch = await enterSearchTextDeferred(page, options);
  await awaitSearch();
}

/**
 * `enterSearchText` split in two, for the handful of upstream assertions that
 * deliberately land in the window BETWEEN typing and the debounced search
 * resolving. Returns a function that awaits the search.
 */
export async function enterSearchTextDeferred(
  page: Page,
  { text, placeholder }: { text: string; placeholder: string | RegExp },
): Promise<() => Promise<void>> {
  // Scoped to the modal, like upstream's enclosing `entityPickerModal().within()`.
  // Unscoped, a /Search/ placeholder also matches the mini picker's still-mounted
  // "Search for tables and more..." input.
  const input = entityPickerModal(page).getByPlaceholder(placeholder, {
    exact: typeof placeholder === "string",
  });
  await input.click();
  await input.fill("");
  const search = searchResponse(page, text).catch(() => null);
  await input.pressSequentially(text, { delay: 20 });
  return async () => {
    await search;
  };
}

/** Port of the spec-local globalSearchTab: cy.findByLabelText("Everywhere"). */
export function globalSearchTab(page: Page): Locator {
  return page.getByLabel("Everywhere", { exact: true });
}

/**
 * Port of the spec-local selectGlobalSearchTab. The SegmentedControl inputs are
 * `sr-only`; upstream clicks the visible text, which is also the only thing
 * Playwright can click (PORTING: never force-click a SegmentedControl radio).
 */
export async function selectGlobalSearchTab(page: Page) {
  await page.getByText("Everywhere", { exact: true }).click();
}

/**
 * Port of the spec-local localSearchTab: cy.findByLabelText(selectedItem).
 * Note `SearchScopeSelector` truncates labels over 20 chars, which is why the
 * original matches personal collections with a regex.
 */
export function localSearchTab(
  page: Page,
  selectedItem: string | RegExp,
): Locator {
  return page.getByLabel(selectedItem, {
    exact: typeof selectedItem === "string",
  });
}

/** Port of the spec-local selectLocalSearchTab. findByText is exact. */
export async function selectLocalSearchTab(page: Page, selectedItem: string) {
  await page
    .getByTestId("search-scope-selector")
    .getByText(selectedItem, { exact: true })
    .click();
}

/**
 * Port of the spec-local findSearchItem: scoped to level 1's scroll container
 * (entityPickerModalItem would otherwise also match the search tab), with the
 * `picker-item-location` subtree excluded the same way.
 */
export function findSearchItem(page: Page, item: string): Locator {
  return entityPickerModalLevel(page, 1)
    .getByTestId("scroll-container")
    .getByText(item, { exact: true })
    .and(page.locator(':not([data-testid="picker-item-location"] *)'));
}

/** Port of the spec-local assertSearchResults. */
export async function assertSearchResults(
  page: Page,
  {
    totalFoundItemsCount,
    foundItems = [],
    notFoundItems = [],
  }: {
    foundItems?: string[];
    notFoundItems?: string[];
    totalFoundItemsCount?: number;
  },
) {
  for (const item of foundItems) {
    // `should("exist")` — presence, not visibility (the list is virtualized).
    await expect(findSearchItem(page, item).first()).toBeAttached();
  }

  for (const item of notFoundItems) {
    await expect(findSearchItem(page, item)).toHaveCount(0);
  }

  if (totalFoundItemsCount != null) {
    await expect(page.getByTestId("result-item")).toHaveCount(
      totalFoundItemsCount,
    );
  }
}

// === fixtures ===

/**
 * Port of the spec-local createTestCards. Also polls the search index: the
 * tests immediately drive a search-backed UI, and `mb.restore()`'s readiness
 * poll only covers the snapshot's own content.
 */
export async function createTestCards(api: MetabaseApi) {
  const types = ["question", "model", "metric"] as const;
  const suffixes = ["1", "2"];
  const collections = [
    { id: null, name: "Root" },
    { id: FIRST_COLLECTION_ID, name: "Regular" },
    { id: ADMIN_PERSONAL_COLLECTION_ID, name: "Admin personal collection" },
    { id: NORMAL_PERSONAL_COLLECTION_ID, name: "Normal personal collection" },
    {
      id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
      name: "No collection personal collection",
    },
  ];

  for (const type of types) {
    for (const suffix of suffixes) {
      for (const { id, name } of collections) {
        await createQuestion(api, {
          ...cardDetails,
          name: `${name} ${type} ${suffix}`,
          type,
          collection_id: id,
          database: SAMPLE_DB_ID,
        });
      }
    }
  }

  for (const suffix of suffixes) {
    await createQuestion(api, {
      ...cardDetails,
      name: `Orders Dashboard question ${suffix}`,
      dashboard_id: ORDERS_DASHBOARD_ID,
      database: SAMPLE_DB_ID,
    });
  }

  await waitForSearchable(api, "Normal personal collection metric 2");
}

/** Port of the spec-local createTestCollections. Returns the "Another collection" id. */
export async function createTestCollections(api: MetabaseApi): Promise<number> {
  const suffixes = ["1", "2"];
  const collections = [
    {
      name: "Admin personal collection",
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal collection",
      parent_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal collection",
      parent_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  for (const suffix of suffixes) {
    for (const collection of collections) {
      await api.post("/api/collection", {
        ...collection,
        name: `${collection.name} ${suffix}`,
      });
    }
  }

  // The Cypress `alias: "anotherCollection"` — returned instead of aliased.
  const response = await api.post("/api/collection", {
    name: "Another collection",
    parent_id: null,
  });
  const anotherCollection = (await response.json()) as { id: number };

  await waitForSearchable(api, "Another collection");
  return anotherCollection.id;
}

/** Port of the spec-local createTestDashboards. */
export async function createTestDashboards(api: MetabaseApi) {
  const suffixes = ["1", "2"];
  const dashboards = [
    { name: "Root dashboard", collection_id: null },
    { name: "Regular dashboard", collection_id: FIRST_COLLECTION_ID },
    {
      name: "Admin personal dashboard",
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal dashboard",
      collection_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal dashboard",
      collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  for (const suffix of suffixes) {
    for (const dashboard of dashboards) {
      await createDashboard(api, {
        ...dashboard,
        name: `${dashboard.name} ${suffix}`,
      });
    }
  }

  await waitForSearchable(api, "No collection personal dashboard 2");
}

/**
 * Poll `/api/search` until a just-created entity is indexed. Search-backed
 * pages refetch once on mount and then cache, so assertion retry cannot rescue
 * a read taken before the index caught up (PORTING, "Search index and async
 * state").
 */
export async function waitForSearchable(api: MetabaseApi, name: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await api.get(
      `/api/search?q=${encodeURIComponent(name)}&limit=10`,
      { failOnStatusCode: false },
    );
    if (response.ok()) {
      const body = (await response.json().catch(() => ({ data: [] }))) as {
        data?: { name?: string; display_name?: string }[];
      };
      // Table hits carry the humanized name in `name`; cards/collections/
      // dashboards likewise. `display_name` is checked too so a renamed table
      // matches whichever field the index happens to expose.
      if (
        (body.data ?? []).some(
          (item) => item.name === name || item.display_name === name,
        )
      ) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`"${name}" never became searchable`);
}

/** Port of the spec-local createTestDashboardWithEmptyCard. */
export async function createTestDashboardWithEmptyCard(
  api: MetabaseApi,
  dashboardDetails: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const dashboard = (await createDashboard(api, dashboardDetails)) as {
    id: number;
  };
  await api.put(`/api/dashboard/${dashboard.id}`, {
    dashcards: [
      {
        id: -1,
        card_id: null,
        dashboard_tab_id: null,
        row: 5,
        col: 0,
        size_x: 24,
        size_y: 1,
        visualization_settings: {
          virtual_card: {
            name: null,
            dataset_query: {},
            display: "placeholder",
            visualization_settings: {},
            archived: false,
          },
        },
        parameter_mappings: [],
      },
    ],
  });
  return dashboard;
}

// === reusable assertion blocks (the spec's shared test bodies) ===

/** Port of the spec-local testCardSearchForNormalUser. */
export async function testCardSearchForNormalUser(page: Page) {
  // root collection
  await clickPickerItem(page, 0, "Our analytics");
  await enterSearchText(page, { text: "2", placeholder: "Search…" });
  await expect(localSearchTab(page, "Everywhere")).toBeChecked();
  await assertSearchResults(page, {
    foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
    notFoundItems: ["Root question 1", "Admin personal collection question 2"],
  });

  // regular collection
  await pickEntity(page, { path: ["Our analytics", "First collection"] });
  await enterSearchText(page, { text: "1", placeholder: "Search…" });
  await expect(localSearchTab(page, "First collection")).toBeChecked();
  await assertSearchResults(page, {
    foundItems: ["Regular question 1", "Regular model 1", "Regular metric 1"],
    notFoundItems: [
      "Root question 1",
      "Regular question 2",
      "Admin personal collection question 1",
      "Normal personal collection question 1",
    ],
  });

  // personal collection. Upstream's bare `cy.findByText(/Personal Collection/)`
  // inside the modal only ever resolves the level-0 root; scoping to level 0
  // makes that explicit and lets the click be paced.
  await clickPickerItem(page, 0, /Personal Collection/);
  await enterSearchText(page, { text: "2", placeholder: "Search…" });
  await expect(localSearchTab(page, /robert tableton/i)).toBeChecked();
  await assertSearchResults(page, {
    foundItems: [
      "Normal personal collection question 2",
      "Normal personal collection model 2",
      "Normal personal collection metric 2",
    ],
    notFoundItems: [
      "Root metric 2",
      "Regular metric 2",
      "Admin personal collection metric 2",
      "Normal personal collection metric 1",
    ],
  });
}

/** Port of the spec-local testCardSearchForInaccessibleRootCollection. */
export async function testCardSearchForInaccessibleRootCollection(page: Page) {
  // regular collection
  await pickEntity(page, { path: ["Collections", "First collection"] });
  await enterSearchText(page, { text: "1", placeholder: "Search…" });
  await expect(localSearchTab(page, "First collection")).toBeChecked();
  await assertSearchResults(page, {
    foundItems: ["Regular question 1", "Regular model 1", "Regular metric 1"],
    notFoundItems: [
      "Root question 1",
      "Regular question 2",
      "Admin personal collection question 1",
      "Normal personal collection question 1",
      "No collection personal collection question 1",
    ],
  });

  // inaccessible root collection
  await clickPickerItem(page, 0, "Collections");
  await enterSearchText(page, { text: "2", placeholder: "Search…" });
  await expect(globalSearchTab(page)).toBeChecked();
  await assertSearchResults(page, {
    notFoundItems: [
      "Root metric 1",
      "Regular metric 1",
      "Admin personal collection metric 1",
      "Normal personal collection metric 2",
    ],
  });

  // personal collection
  await clickPickerItem(page, 0, /Personal Collection/);
  await enterSearchText(page, { text: "1", placeholder: "Search…" });
  await expect(localSearchTab(page, /no collection/i)).toBeChecked();
  await assertSearchResults(page, {
    foundItems: [
      "No collection personal collection question 1",
      "No collection personal collection model 1",
      "No collection personal collection metric 1",
    ],
    notFoundItems: [
      "Root metric 1",
      "Regular metric 1",
      "Admin personal collection metric 1",
      "Normal personal collection metric 2",
    ],
  });
}

/** Port of the spec-local testCardSearchForAllPersonalCollections. */
export async function testCardSearchForAllPersonalCollections(page: Page) {
  await clickPickerItem(page, 0, "All personal collections");
  const awaitSearch = await enterSearchTextDeferred(page, {
    text: "root",
    placeholder: "Search…",
  });
  await assertNoSearchScopeSelectorYet(page);
  await awaitSearch();
  // This half is the test's actual subject and DOES hold once the results have
  // rendered — "All personal collections" is not a valid local scope
  // (use-current-search-scope.ts isValidScope), so it is never offered.
  await expect(localSearchTab(page, "All personal collections")).toHaveCount(0);
  await assertSearchResults(page, {
    foundItems: ["Root question 1", "Root model 1", "Root metric 1"],
  });
}

/**
 * Port of upstream's `globalSearchTab().should("not.exist")` in the four
 * "should not allow local search for `all personal collections`" tests.
 *
 * **This assertion is vacuous upstream and the port keeps it that way,
 * deliberately.** `SearchScopeSelector` lives inside `SearchResultsItemList`,
 * which only mounts once the debounced search resolves; upstream asserts in the
 * gap between `.type()` returning and the 300ms debounce firing, so it can only
 * ever observe "nothing rendered yet". Measured on the CI EE jar: the locator
 * resolves to **0** here and to **1** the moment the search returns — the
 * selector renders with a single "Everywhere" option, because
 * `disableSearchScope` is not set for this picker and `options` is filtered
 * down to just that one entry (SearchResults.tsx:224-240).
 *
 * The Cypress original passes all four tests on the same jar/backend
 * (`--browser chrome`), so this is upstream's own timing accident, not port
 * drift. Anchoring it — the standing PORTING fix for absence assertions —
 * turns it red, so it is left at upstream's instant with a one-shot count
 * (PORTING's "genuinely momentary absence" case) rather than silently
 * strengthened into a failure or silently dropped. See findings-inbox.
 */
export async function assertNoSearchScopeSelectorYet(page: Page) {
  expect(await globalSearchTab(page).count()).toBe(0);
  expect(await localSearchTab(page, "All personal collections").count()).toBe(
    0,
  );
}
