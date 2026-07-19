/**
 * Helpers for the data-studio library spec port
 * (e2e/test/scenarios/data-studio/data-studio-library.cy.spec.ts).
 *
 * Ports of:
 * - H.DataStudio.Library.* / H.DataStudio.breadcrumbs / H.DataStudio.Tables.*
 *   (e2e/support/helpers/e2e-data-studio-helpers.ts)
 * - e2e/support/test-library-data.ts (TRUSTED_ORDERS_METRIC,
 *   createLibraryWithItems, createLibraryWithTable)
 * - the spec-local getLibraryRootCollections / createLibraryCollection /
 *   openCollectionOptions / openTableOptions / expandLibraryCollection
 *
 * New module per PORTING rule 9 — imports read-only from the shared support
 * modules (api.ts, ui.ts, factories.ts) and does not edit them.
 *
 * Snowplow helpers → no-op stubs (PORTING rule 6; no snowplow-micro in the
 * spike harness). The UI actions still fire, only the assertions are stubbed.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createQuestion } from "./factories";
import { expect } from "./fixtures";
import { SAMPLE_DATABASE } from "./sample-data";
import { caseSensitiveSubstring } from "./text";

const { ORDERS_ID } = SAMPLE_DATABASE;

// === Snowplow stubs (PORTING rule 6) ================================
export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

// === Types ==========================================================

type LibraryCollection = {
  id: number;
  name: string;
  type?: string;
};

type LibraryResponse = {
  id: number;
  effective_children?: LibraryCollection[];
};

/** Port of TRUSTED_ORDERS_METRIC (e2e/support/test-library-data.ts). */
export const TRUSTED_ORDERS_METRIC = {
  name: "Trusted Orders Metric",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

// === Data-studio chrome =============================================

/** Port of H.DataStudio.nav(). */
export function dataStudioNav(page: Page): Locator {
  return page.getByTestId("data-studio-nav");
}

/** Port of H.DataStudio.breadcrumbs(). */
export function dataStudioBreadcrumbs(page: Page): Locator {
  return page.getByTestId("data-studio-breadcrumbs");
}

/** Port of H.DataStudio.Tables.overviewPage(). */
export function tableOverviewPage(page: Page): Locator {
  return page.getByTestId("table-overview-page");
}

/** Port of H.DataStudio.Tables.header(). */
export function tableHeader(page: Page): Locator {
  return page.getByTestId("table-pane-header");
}

/** Port of H.DataStudio.Metrics.moreMenu(): findByLabelText("More options"). */
export function metricMoreMenu(page: Page): Locator {
  return page.getByLabel("More options", { exact: true });
}

// === Library page ===================================================

/** Port of H.DataStudio.Library.libraryPage(). */
export function libraryPage(page: Page): Locator {
  return page.getByTestId("library-page");
}

/**
 * Port of H.DataStudio.Library.collectionItem(name):
 * libraryPage().findAllByTestId("collection-name").contains(name).
 * `cy.contains` is a case-sensitive substring returning the first hit.
 */
export function collectionItem(page: Page, name: string | RegExp): Locator {
  return libraryPage(page)
    .getByTestId("collection-name")
    .filter({
      hasText: typeof name === "string" ? caseSensitiveSubstring(name) : name,
    })
    .first();
}

/**
 * Port of H.DataStudio.Library.tableItem(name):
 * allTableItems().contains(name) (case-sensitive substring, first hit).
 */
export function tableItem(page: Page, name: string): Locator {
  return libraryPage(page)
    .getByTestId("table-name")
    .filter({ hasText: caseSensitiveSubstring(name) })
    .first();
}

/**
 * Port of H.DataStudio.Library.result(name):
 * libraryPage().findByText(name).closest('[role="row"]').
 *
 * Built as a row filtered by an exact-text descendant rather than
 * getByText(...).locator("xpath=ancestor::…") so the assertion targets the row
 * itself (aria-level lives there). The `has` sub-locator is built from `page`,
 * never from the scope — PORTING wave-11 gotcha.
 */
export function libraryResult(page: Page, name: string): Locator {
  return libraryPage(page)
    .locator('[role="row"]')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** Port of H.DataStudio.Library.newButton(). */
export function libraryNewButton(page: Page): Locator {
  return libraryPage(page).getByRole("button", { name: /New/ });
}

/**
 * Port of H.DataStudio.Library.emptyStateRow(description):
 * libraryPage().contains('[data-testid="empty-state-row"]', description) —
 * case-sensitive substring, first hit.
 */
export function emptyStateRow(page: Page, description: string): Locator {
  return libraryPage(page)
    .getByTestId("empty-state-row")
    .filter({ hasText: caseSensitiveSubstring(description) })
    .first();
}

/** The library page's search box (placeholder "Search..."). */
export function librarySearchInput(page: Page): Locator {
  return libraryPage(page).getByPlaceholder("Search...", { exact: true });
}

/**
 * Port of H.DataStudio.Library.visit(): navigate and assert the three root
 * collections rendered.
 */
export async function visitLibrary(page: Page) {
  await page.goto("/data-studio/library");
  await expect(libraryPage(page)).toBeVisible();
  await expect(collectionItem(page, "Data")).toBeVisible();
  await expect(collectionItem(page, "Metrics")).toBeVisible();
  await expect(collectionItem(page, "SQL snippets")).toBeVisible();
}

// === Row menus ======================================================

/** Port of the spec-local openCollectionOptions. */
export async function openCollectionOptions(page: Page, name: string) {
  await libraryResult(page, name)
    .getByLabel("Collection options", { exact: true })
    .click();
}

/** Port of the spec-local openTableOptions. */
export async function openTableOptions(page: Page, name: string) {
  await libraryResult(page, name)
    .getByLabel("Show table options", { exact: true })
    .click();
}

/** Port of the spec-local expandLibraryCollection. */
export async function expandLibraryCollection(page: Page, name: string) {
  await libraryResult(page, name)
    .getByRole("button", { name: "Expand", exact: true })
    .click();
}

// === API fixtures ===================================================

/**
 * Port of the spec-local getLibraryRootCollections: GET /api/ee/library and
 * pull out the `library-data` / `library-metrics` children. The Cypress version
 * asserts both exist; kept as real assertions.
 */
export async function getLibraryRootCollections(api: MetabaseApi): Promise<{
  dataCollection: LibraryCollection;
  metricCollection: LibraryCollection;
}> {
  const body = (await (await api.get("/api/ee/library")).json()) as
    LibraryResponse;
  const dataCollection = body.effective_children?.find(
    (collection) => collection.type === "library-data",
  );
  const metricCollection = body.effective_children?.find(
    (collection) => collection.type === "library-metrics",
  );

  expect(dataCollection, "Data collection").toBeTruthy();
  expect(metricCollection, "Metrics collection").toBeTruthy();

  return {
    dataCollection: dataCollection as LibraryCollection,
    metricCollection: metricCollection as LibraryCollection,
  };
}

/** Port of the spec-local createLibraryCollection. */
export async function createLibraryCollection(
  api: MetabaseApi,
  {
    name,
    description = null,
    parent_id,
  }: { name: string; description?: string | null; parent_id: number },
): Promise<LibraryCollection> {
  const response = await api.post("/api/collection", {
    name,
    description,
    parent_id,
  });
  return (await response.json()) as LibraryCollection;
}

/** Port of H.createCollection({ name }) — the subset this spec uses. */
export async function createCollection(
  api: MetabaseApi,
  name: string,
): Promise<LibraryCollection> {
  const response = await api.post("/api/collection", { name });
  return (await response.json()) as LibraryCollection;
}

/**
 * Port of createLibraryWithItems (e2e/support/test-library-data.ts): create the
 * library, publish ORDERS into it, and file a metric into the Metrics
 * collection. Returns the ids the Cypress version aliased.
 */
export async function createLibraryWithItems(api: MetabaseApi): Promise<{
  trustedMetricId: number;
  metricsCollectionId: number | undefined;
}> {
  const body = (await api.createLibrary()) as LibraryResponse;
  const metricsCollection = body.effective_children?.find(
    (child) => child.name === "Metrics",
  );

  await api.publishTables({ table_ids: [ORDERS_ID] });
  const card = await createQuestion(api, TRUSTED_ORDERS_METRIC);
  await api.put(`/api/card/${card.id}`, {
    collection_id: metricsCollection?.id,
  });

  return {
    trustedMetricId: card.id,
    metricsCollectionId: metricsCollection?.id,
  };
}

/** Port of createLibraryWithTable (e2e/support/test-library-data.ts). */
export async function createLibraryWithTable(api: MetabaseApi) {
  await api.createLibrary();
  await api.publishTables({ table_ids: [ORDERS_ID] });
}
