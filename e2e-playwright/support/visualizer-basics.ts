/**
 * Helpers for the visualizer-basics spec port
 * (e2e/test/scenarios/dashboard/visualizer/basics.cy.spec.ts).
 *
 * NEW helpers live here (parallel-agent rule: no edits to shared modules).
 * Ports of:
 * - the fixtures + dashcard builders in e2e/support/test-visualizer-data.ts
 *   (question details, createDashboardWithVisualizerDashcards and the
 *   createVisualizer* dashcard builders).
 * - the visualizer `H` helpers in e2e-dashboard-visualizer-helpers.ts
 *   (clickVisualizeAnotherWay / dataImporter / wells / assertWellItems /
 *   selectDataset / selectVisualization / assertCurrentVisualization /
 *   showDashcardVisualizerModal / saveDashcardVisualizerModal /
 *   resetDataSourceButton / assertDataSourceColumnSelected / …).
 * - the dashboard/visual `H` helpers not in shared modules
 *   (openQuestionsSidebar, showUnderlyingQuestion, clickOnCardTitle,
 *   assertDashboardCardTitle, chartGridLines, goalLine).
 * - the api helpers whose upstream versions hold fields back from POST or
 *   aren't otherwise available (createQuestion / createNativeQuestion /
 *   createDashboard-with-enable_embedding / addQuestionToDashboard /
 *   createNativeQuestionAndDashboard / createPublicDashboardLink).
 *
 * TODO(consolidation): saveDashcardVisualizerModal / showDashcardVisualizerModal
 * overlap dashboard-card-repros.ts; the well/data-importer helpers are the
 * visualizer surface that should become one shared module.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getDashboardCard, sidebar } from "./dashboard";
import {
  createDashboard as createDashboardFactory,
  createNativeQuestion as createNativeQuestionFactory,
  createNativeQuestionAndDashboard,
  createQuestion as createQuestionFactory,
  type DashboardDetails,
} from "./factories";
import { showDashboardCardActions } from "./dashboard-cards";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { modal } from "./ui";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE as {
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
  ORDERS: Record<string, number>;
  ORDERS_ID: number;
};

// === question fixtures (test-visualizer-data.ts) ===

export type StructuredQuestionDetails = {
  name: string;
  display: string;
  query: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
};

export type NativeQuestionDetails = {
  name: string;
  display: string;
  native: { query: string; "template-tags"?: Record<string, unknown> };
};

// Not using the one from "metabase/visualizer/utils" (circular dep upstream).
function createDataSourceNameRef(id: string): string {
  return `$_${id}_name`;
}

export const ORDERS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "line",
  name: "Orders by Created At (Month)",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const ORDERS_COUNT_BY_PRODUCT_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Orders by Product Category",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Products by Created At (Month)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_AVERAGE_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Products average by Created At (Month)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Products by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

export const PRODUCTS_COUNT_BY_CATEGORY_PIE: StructuredQuestionDetails = {
  ...PRODUCTS_COUNT_BY_CATEGORY,
  display: "pie",
  name: "Products by Category (Pie)",
};

export const SCALAR_CARD: Record<string, NativeQuestionDetails> = {
  LANDING_PAGE_VIEWS: {
    display: "scalar",
    name: "Landing Page",
    native: { query: 'SELECT 1000 as "views"' },
  },
  CHECKOUT_PAGE_VIEWS: {
    display: "scalar",
    name: "Checkout Page",
    native: { query: 'SELECT 600 as "views"' },
  },
  PAYMENT_DONE_PAGE_VIEWS: {
    display: "scalar",
    name: "Payment Done Page",
    native: { query: 'SELECT 100 as "views"' },
  },
};

export const STEP_COLUMN_CARD: NativeQuestionDetails = {
  name: "Step Column",
  display: "table",
  native: {
    query: `
      SELECT 'Landing page' AS "Step"
      UNION
      SELECT 'Checkout page' AS "Step"
      UNION
      SELECT 'Payment done page' AS "Step"
    `,
  },
};

export const VIEWS_COLUMN_CARD: NativeQuestionDetails = {
  name: "Views Column",
  display: "table",
  native: {
    query: `
      SELECT 1000 as "Views"
      UNION
      SELECT 600 as "Views"
      UNION
      SELECT 100 as "Views"
    `,
  },
};

// === api helpers ===

// The create* logic is now canonical in ./factories. These stay as thin
// adapters because this module's consumers assign the raw `number` id
// (`const questionId = await createQuestion(...)`), whereas the factories return
// the created object — so the adapter returns `.id`.
export async function createQuestion(
  api: MetabaseApi,
  details: StructuredQuestionDetails & {
    description?: string;
    collection_id?: number;
  },
): Promise<number> {
  return (await createQuestionFactory(api, details)).id;
}

export async function createNativeQuestion(
  api: MetabaseApi,
  details: NativeQuestionDetails,
): Promise<number> {
  return (await createNativeQuestionFactory(api, details)).id;
}

export async function createDashboard(
  api: MetabaseApi,
  details: DashboardDetails = {},
): Promise<number> {
  return (await createDashboardFactory(api, details)).id;
}

// createNativeQuestionAndDashboard is a bare re-export from ./factories (its
// { id, card_id, dashboard_id } return matches this module's consumers).
export { createNativeQuestionAndDashboard };

/** Port of H.addQuestionToDashboard: append a dashcard, keeping existing ones. */
export async function addQuestionToDashboard(
  api: MetabaseApi,
  { dashboardId, cardId }: { dashboardId: number; cardId: number },
): Promise<void> {
  const { body } = { body: await (await api.get(`/api/dashboard/${dashboardId}`)).json() };
  const dashcards = body.dashcards ?? [];
  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      ...dashcards,
      { id: -1, card_id: cardId, row: 0, col: 0, size_x: 11, size_y: 8 },
    ],
  });
}

/** Port of H.createPublicDashboardLink. */
export async function createPublicDashboardLink(
  api: MetabaseApi,
  dashboardId: number,
): Promise<string> {
  const response = await api.post(
    `/api/dashboard/${dashboardId}/public_link`,
    {},
  );
  return (await response.json()).uuid as string;
}

// === dashcard builders + createDashboardWithVisualizerDashcards ===

export type VisualizerQuestionIds = {
  ordersCountByCreatedAtQuestionId: number;
  ordersCountByProductCategoryQuestionId: number;
  productsCountByCategoryQuestionId: number;
  productsCountByCreatedAtQuestionId: number;
  landingPageViewsScalarQuestionId: number;
  checkoutPageViewsScalarQuestionId: number;
  paymentDonePageViewsScalarQuestionId: number;
  stepColumnQuestionId: number;
  viewsColumnQuestionId: number;
};

function createVisualizerDashcardWithTimeseriesBreakout(
  ordersCountByCreatedAtQuestionId: number,
  productsCountByCreatedAtQuestionId: number,
  dashcardOpts = {},
) {
  return {
    id: -1,
    ...dashcardOpts,
    card_id: ordersCountByCreatedAtQuestionId,
    series: [{ id: productsCountByCreatedAtQuestionId, ...PRODUCTS_COUNT_BY_CREATED_AT }],
    visualization_settings: {
      visualization: {
        display: "line",
        columnValuesMapping: {
          COLUMN_1: [{ name: "COLUMN_1", originalName: "CREATED_AT", sourceId: `card:${ordersCountByCreatedAtQuestionId}` }],
          COLUMN_2: [{ name: "COLUMN_2", originalName: "count", sourceId: `card:${ordersCountByCreatedAtQuestionId}` }],
          COLUMN_3: [{ name: "COLUMN_3", originalName: "CREATED_AT", sourceId: `card:${productsCountByCreatedAtQuestionId}` }],
          COLUMN_4: [{ name: "COLUMN_4", originalName: "count", sourceId: `card:${productsCountByCreatedAtQuestionId}` }],
        },
        settings: {
          "card.title": "My chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

function createVisualizerDashcardWithCategoryBreakout(
  ordersCountByCategoryQuestionId: number,
  productsCountByCategoryQuestionId: number,
  dashcardOpts = {},
) {
  return {
    id: -1,
    ...dashcardOpts,
    card_id: ordersCountByCategoryQuestionId,
    series: [{ id: productsCountByCategoryQuestionId, ...PRODUCTS_COUNT_BY_CATEGORY }],
    visualization_settings: {
      visualization: {
        display: "bar",
        columnValuesMapping: {
          COLUMN_1: [{ name: "COLUMN_1", originalName: "CATEGORY", sourceId: `card:${ordersCountByCategoryQuestionId}` }],
          COLUMN_2: [{ name: "COLUMN_2", originalName: "count", sourceId: `card:${ordersCountByCategoryQuestionId}` }],
          COLUMN_3: [{ name: "COLUMN_3", originalName: "CATEGORY", sourceId: `card:${productsCountByCategoryQuestionId}` }],
          COLUMN_4: [{ name: "COLUMN_4", originalName: "count", sourceId: `card:${productsCountByCategoryQuestionId}` }],
        },
        settings: {
          "card.title": "My category chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

function createVisualizerPieChartDashcard(
  productsCountByCategoryQuestionId: number,
  dashcardOpts = {},
) {
  return {
    id: -1,
    card_id: productsCountByCategoryQuestionId,
    ...dashcardOpts,
    visualization_settings: {
      visualization: {
        display: "pie",
        columnValuesMapping: {
          COLUMN_1: [{ name: "COLUMN_1", originalName: "CATEGORY", sourceId: `card:${productsCountByCategoryQuestionId}` }],
          COLUMN_2: [{ name: "COLUMN_2", originalName: "count", sourceId: `card:${productsCountByCategoryQuestionId}` }],
        },
        settings: {
          "card.title": "My pie chart",
          "pie.metric": "COLUMN_2",
          "pie.dimension": ["COLUMN_1"],
        },
      },
    },
  };
}

function createVisualizerFunnel(
  stepColumnQuestionId: number,
  viewsColumnQuestionId: number,
  dashcardOpts = {},
) {
  return {
    id: -1,
    ...dashcardOpts,
    card_id: stepColumnQuestionId,
    series: [{ id: viewsColumnQuestionId, ...VIEWS_COLUMN_CARD }],
    visualization_settings: {
      visualization: {
        display: "funnel",
        columnValuesMapping: {
          COLUMN_1: [{ name: "COLUMN_1", originalName: "Step", sourceId: `card:${stepColumnQuestionId}` }],
          COLUMN_2: [{ name: "COLUMN_2", originalName: "Views", sourceId: `card:${viewsColumnQuestionId}` }],
        },
        settings: {
          "card.title": "Regular visualizer funnel",
          "funnel.metric": "COLUMN_2",
          "funnel.dimension": "COLUMN_1",
        },
      },
    },
  };
}

function createVisualizerScalarFunnel(
  landingPageViewsScalarQuestionId: number,
  checkoutPageViewsScalarQuestionId: number,
  paymentDonePageViewsScalarQuestionId: number,
  dashcardOpts = {},
) {
  return {
    id: -1,
    ...dashcardOpts,
    card_id: landingPageViewsScalarQuestionId,
    series: [
      { id: checkoutPageViewsScalarQuestionId, ...SCALAR_CARD.CHECKOUT_PAGE_VIEWS },
      { id: paymentDonePageViewsScalarQuestionId, ...SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS },
    ],
    visualization_settings: {
      visualization: {
        display: "funnel",
        columnValuesMapping: {
          METRIC: [
            { sourceId: `card:${landingPageViewsScalarQuestionId}`, originalName: "views", name: "COLUMN_1" },
            { sourceId: `card:${checkoutPageViewsScalarQuestionId}`, originalName: "views", name: "COLUMN_2" },
            { sourceId: `card:${paymentDonePageViewsScalarQuestionId}`, originalName: "views", name: "COLUMN_3" },
          ],
          DIMENSION: [
            createDataSourceNameRef(`card:${landingPageViewsScalarQuestionId}`),
            createDataSourceNameRef(`card:${checkoutPageViewsScalarQuestionId}`),
            createDataSourceNameRef(`card:${paymentDonePageViewsScalarQuestionId}`),
          ],
        },
        settings: {
          "card.title": "Scalar funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      },
    },
  };
}

/** Port of createDashboardWithVisualizerDashcards: build a dashboard of six
 * visualizer dashcards and PUT them. Returns the dashboard id (does not visit —
 * unlike the Cypress helper, the caller navigates). */
export async function createDashboardWithVisualizerDashcards(
  api: MetabaseApi,
  ids: VisualizerQuestionIds,
  { enable_embedding = false }: { enable_embedding?: boolean } = {},
): Promise<number> {
  const dashboardId = await createDashboard(api, { enable_embedding });

  const dc1 = createVisualizerDashcardWithTimeseriesBreakout(
    ids.ordersCountByCreatedAtQuestionId,
    ids.productsCountByCreatedAtQuestionId,
    { id: -1, col: 0, row: 0, size_x: 12, size_y: 8 },
  );
  const dc2 = createVisualizerDashcardWithCategoryBreakout(
    ids.ordersCountByProductCategoryQuestionId,
    ids.productsCountByCategoryQuestionId,
    { id: -2, col: 12, row: 0, size_x: 12, size_y: 8 },
  );
  const dc3 = createVisualizerPieChartDashcard(
    ids.productsCountByCategoryQuestionId,
    { id: -3, col: 0, row: 8, size_x: 12, size_y: 8 },
  );
  const dc4 = {
    id: -4,
    card_id: ids.productsCountByCreatedAtQuestionId,
    col: 12,
    row: 8,
    size_x: 12,
    size_y: 8,
  };
  const dc5 = createVisualizerFunnel(
    ids.stepColumnQuestionId,
    ids.viewsColumnQuestionId,
    { id: -5, col: 0, row: 16, size_x: 12, size_y: 8 },
  );
  const dc6 = createVisualizerScalarFunnel(
    ids.landingPageViewsScalarQuestionId,
    ids.checkoutPageViewsScalarQuestionId,
    ids.paymentDonePageViewsScalarQuestionId,
    { id: -6, col: 12, row: 16, size_x: 12, size_y: 8 },
  );

  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [dc1, dc2, dc3, dc4, dc5, dc6],
  });
  return dashboardId;
}

// === request waits ===

/** Resolve after `count` POST /api/card/:id/query responses. Register BEFORE
 * the triggering action, await after (the cy.intercept("@cardQuery") + cy.wait
 * pattern). */
export function waitForCardQueries(page: Page, count = 1): Promise<void> {
  let seen = 0;
  return new Promise((resolve) => {
    const handler = (response: import("@playwright/test").Response) => {
      if (
        response.request().method() === "POST" &&
        /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname)
      ) {
        seen += 1;
        if (seen >= count) {
          page.off("response", handler);
          resolve();
        }
      }
    };
    page.on("response", handler);
  });
}

// === visualizer UI helpers (e2e-dashboard-visualizer-helpers.ts) ===

export function dataImporter(page: Page): Locator {
  return page.getByTestId("visualizer-data-importer");
}

/** Port of H.clickVisualizeAnotherWay: from the questions sidebar. */
export async function clickVisualizeAnotherWay(page: Page, name: string) {
  await sidebar(page)
    .getByRole("menuitem", { name, exact: true })
    .locator("..")
    .getByLabel("Visualize another way")
    .click({ force: true });

  const dialog = modal(page);
  await expect(dialog.getByTestId("visualization-canvas-loader")).toHaveCount(0);
  await expect(
    dataImporter(page).getByTestId("loading-indicator"),
  ).toHaveCount(0);
}

/** Port of H.openQuestionsSidebar. */
export async function openQuestionsSidebar(page: Page) {
  await page.getByTestId("dashboard-header").getByLabel("Add questions").click();
}

export function verticalWell(page: Page): Locator {
  return page.getByTestId("vertical-well");
}

export function horizontalWell(page: Page): Locator {
  return page.getByTestId("horizontal-well");
}

export function pieMetricWell(page: Page): Locator {
  return page.getByTestId("pie-metric-well");
}

export function pieDimensionWell(page: Page): Locator {
  return page.getByTestId("pie-dimension-well");
}

function wellFor(page: Page, key: "horizontal" | "vertical" | "pieMetric" | "pieDimensions"): Locator {
  switch (key) {
    case "horizontal":
      return horizontalWell(page);
    case "vertical":
      return verticalWell(page);
    case "pieMetric":
      return pieMetricWell(page);
    case "pieDimensions":
      return pieDimensionWell(page);
  }
}

/** Port of H.assertWellItems: each named well has exactly the given items. */
export async function assertWellItems(
  page: Page,
  items: {
    horizontal?: string[];
    vertical?: string[];
    pieMetric?: string[];
    pieDimensions?: string[];
  },
) {
  for (const [key, values] of Object.entries(items) as [
    keyof typeof items,
    string[],
  ][]) {
    if (!values) {
      continue;
    }
    const well = wellFor(page, key);
    await expect(well.getByTestId("well-item")).toHaveCount(values.length);
    for (const value of values) {
      await expect(well.getByText(value, { exact: true })).toBeVisible();
    }
  }
}

/** Port of H.assertWellItemsCount. */
export async function assertWellItemsCount(
  page: Page,
  items: {
    horizontal?: number;
    vertical?: number;
    pieMetric?: number;
    pieDimensions?: number;
  },
) {
  for (const [key, count] of Object.entries(items) as [
    keyof typeof items,
    number,
  ][]) {
    if (count == null) {
      continue;
    }
    await expect(
      wellFor(page, key).getByTestId("well-item"),
    ).toHaveCount(count);
  }
}

export async function switchToAddMoreData(page: Page) {
  await modal(page).getByRole("button", { name: "Add more data", exact: true }).click();
}

export async function switchToColumnsList(page: Page) {
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
}

/** Port of H.selectDataset: type into the search box, click the matching
 * swap-dataset-button, and wait for the resulting card query. */
export async function selectDataset(page: Page, datasetName: string) {
  const search = page.getByPlaceholder("Search for something");
  await search.click();
  await search.fill("");
  await search.pressSequentially(datasetName);

  const dataset = page
    .getByTestId("swap-dataset-button")
    .filter({ has: page.getByText(datasetName, { exact: true }) })
    .first();
  await expect(dataset).not.toHaveAttribute("aria-pressed", "true");

  const cardQuery = waitForCardQueries(page, 1);
  await dataset.click({ force: true });
  await cardQuery;
}

/**
 * Port of H.dataSource: the data-source row in the importer whose text contains
 * `dataSourceName`. Canonical home for the visualizer surface — the copies in
 * visualizer-cartesian.ts / metrics-dashboard.ts now re-export from here.
 */
export function dataSource(page: Page, dataSourceName: string): Locator {
  return dataImporter(page)
    .getByTestId("data-source-list-item")
    .filter({ has: page.getByText(dataSourceName, { exact: true }) });
}

/** Port of H.dataSourceColumn. */
export function dataSourceColumn(
  page: Page,
  dataSourceName: string,
  columnName: string,
): Locator {
  return dataSource(page, dataSourceName)
    .getByTestId("column-list-item")
    .filter({ has: page.getByText(columnName, { exact: true }) });
}

/** Port of H.selectColumnFromColumnsList. */
export async function selectColumnFromColumnsList(
  page: Page,
  dataSourceName: string,
  columnName: string,
) {
  await dataSourceColumn(page, dataSourceName, columnName).click();
}

/**
 * Port of H.removeDataSource (default, non-menu path): click the first "Remove"
 * button in the data source's row.
 */
export async function removeDataSource(page: Page, dataSourceName: string) {
  await dataSource(page, dataSourceName)
    .getByLabel("Remove")
    .first()
    .click({ force: true });
}

/**
 * Port of H.ensureDisplayIsSelected: the viz-type radio for `display` is
 * checked. Cypress uses cy.findByDisplayValue (single match); mirror the
 * modal-scoped `input[value=...]` precedent used elsewhere in this module.
 */
export async function ensureDisplayIsSelected(page: Page, display: string) {
  await expect(modal(page).locator(`input[value="${display}"]`)).toBeChecked();
}

/** Port of H.chartLegend. `scope` mirrors the Cypress calls, which ran the bare
 * helper both at page scope and inside `.within()` blocks. */
export function chartLegend(scope: Page | Locator): Locator {
  return scope.getByLabel("Legend", { exact: true });
}

/** Port of H.chartLegendItems. */
export function chartLegendItems(scope: Page | Locator): Locator {
  return chartLegend(scope).getByTestId("legend-item");
}

/** Port of H.chartLegendItem(name): chartLegend().findByText(name). A string
 * findByText is an exact match (rule 1). */
export function chartLegendItem(scope: Page | Locator, name: string): Locator {
  return chartLegend(scope).getByText(name, { exact: true });
}

/** Port of H.assertDataSourceColumnSelected. */
export async function assertDataSourceColumnSelected(
  page: Page,
  dataSourceName: string,
  columnName: string,
  isSelected = true,
) {
  await expect(
    dataSourceColumn(page, dataSourceName, columnName),
  ).toHaveAttribute("aria-selected", String(isSelected));
}

/** Port of H.deselectColumnFromColumnsList. */
export async function deselectColumnFromColumnsList(
  page: Page,
  datasetName: string,
  columnName: string,
) {
  await dataSourceColumn(page, datasetName, columnName)
    .getByLabel("Remove")
    .click();
}

/** Port of H.resetDataSourceButton: open the datasource actions menu and return
 * the "Reset data source" item. */
export async function resetDataSourceButton(
  page: Page,
  dataSourceName: string,
): Promise<Locator> {
  const source = dataSource(page, dataSourceName);
  // The ellipsis is visibility:hidden until the HEADER row (.parent) is hovered
  // — hover the source-name text, which lives in that header, not the list-item
  // center (which sits over a column row and doesn't reveal it). Then click the
  // now-visible Mantine Menu.Target (a force-click on the hidden button missed
  // and closed the modal).
  await source.getByText(dataSourceName, { exact: true }).first().hover();
  const actions = source.getByLabel("Datasource actions");
  await expect(actions).toBeVisible();
  await actions.click();
  const dropdown = page.getByTestId("datasource-actions-dropdown");
  await expect(dropdown).toBeVisible();
  return dropdown.getByLabel("Reset data source");
}

/** Port of H.selectVisualization. */
export async function selectVisualization(page: Page, visualization: string) {
  await page.getByTestId("viz-picker-main").getByTestId(visualization).click();
}

/** Port of H.assertCurrentVisualization. */
export async function assertCurrentVisualization(page: Page, name: string) {
  await expect(
    page.getByTestId("viz-picker-main").locator(`input[value="${name}"]`),
  ).toBeChecked();
}

/** Port of H.showDashcardVisualizerModal. */
export async function showDashcardVisualizerModal(
  page: Page,
  index = 0,
  { isVisualizerCard = true }: { isVisualizerCard?: boolean } = {},
) {
  await showDashboardCardActions(page, index);
  await getDashboardCard(page, index)
    .getByLabel(isVisualizerCard ? "Edit visualization" : "Visualize another way")
    .click({ force: true });

  const dialog = modal(page);
  // Assert the modal is actually open before the loader checks — those are
  // toHaveCount(0) and pass vacuously if the click never opened the modal.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("visualization-canvas-loader")).toHaveCount(0);
  await expect(
    dataImporter(page).getByTestId("loading-indicator"),
  ).toHaveCount(0);
}

/** Port of H.saveDashcardVisualizerModal. */
export async function saveDashcardVisualizerModal(
  page: Page,
  { mode = "update" }: { mode?: "create" | "update" } = {},
) {
  await modal(page)
    .getByText(mode === "create" ? "Add to dashboard" : "Save", { exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0, { timeout: 6000 });
}

/** Port of H.showUnderlyingQuestion. */
export async function showUnderlyingQuestion(
  page: Page,
  index: number,
  title: string,
) {
  await getDashboardCard(page, index)
    .getByTestId("legend-caption-title")
    .click();
  await page
    .getByTestId("legend-caption-menu")
    .getByText(title, { exact: true })
    .click();
}

/** Port of H.clickOnCardTitle. */
export async function clickOnCardTitle(page: Page, index: number) {
  await getDashboardCard(page, index)
    .getByTestId("legend-caption-title")
    .click();
}

/** Port of H.assertDashboardCardTitle. */
export async function assertDashboardCardTitle(
  page: Page,
  index: number,
  title: string,
) {
  await expect(
    getDashboardCard(page, index).getByTestId("legend-caption-title"),
  ).toHaveText(title);
}

/** Port of H.chartGridLines, scoped to a dashcard. */
export function chartGridLines(scope: Locator): Locator {
  return scope
    .getByTestId("chart-container")
    .locator(
      "path[stroke='var(--mb-color-cartesian-grid-line)'][fill='none']",
    );
}

/** Port of H.goalLine (GOAL_LINE_DASH = [3, 4]). */
export function goalLine(scope: Page | Locator): Locator {
  return scope
    .getByTestId("chart-container")
    .locator(`path[stroke-dasharray='3,4']`);
}

/** Port of the EditableText rename dance: fill() doesn't mark it dirty, so
 * click, select-all, type real keystrokes, blur. `newValue = ""` clears it. */
export async function renameEditableText(field: Locator, newValue: string) {
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.press("Delete");
  if (newValue) {
    await field.pressSequentially(newValue);
  }
  await field.blur();
}
