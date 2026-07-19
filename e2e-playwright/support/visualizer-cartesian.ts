/**
 * Helpers for the visualizer-cartesian spec port
 * (e2e/test/scenarios/dashboard/visualizer/cartesian.cy.spec.ts).
 *
 * NEW helpers only (parallel-agent rule: no edits to shared modules). This
 * module imports the shared visualizer surface from support/visualizer-basics.ts
 * and only adds what that module doesn't already export:
 *  - the extra question fixtures this spec needs
 *    (ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
 *    PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY, PIVOT_TABLE_CARD) from
 *    e2e/support/test-visualizer-data.ts.
 *  - the `H` helpers from e2e-dashboard-visualizer-helpers.ts not exported by
 *    visualizer-basics: chartLegend / chartLegendItems / dataSource /
 *    dataSourceColumn / selectColumnFromColumnsList / removeDataSource /
 *    ensureDisplayIsSelected / showDashcardVisualizerModalSettings /
 *    saveDashcardVisualizerModalSettings.
 *  - scoped chart helpers (chartPathWithFillColor / trendLine / echartsTextExact)
 *    because the spec calls the bare Cypress helpers inside `H.modal().within()`
 *    and `H.getDashboardCard(n).within()`, so they must resolve within a scope,
 *    not page-globally (the dashboard behind the modal has its own
 *    chart-containers).
 *
 * TODO(consolidation): fold this into a single shared visualizer module with
 * visualizer-basics.ts — dataSource / dataSourceColumn are re-implemented here
 * only because they're private there.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { getDashboardCard } from "./dashboard";
import { SAMPLE_DATABASE } from "./sample-data";
import { modal } from "./ui";
import {
  type StructuredQuestionDetails,
  dataImporter,
  saveDashcardVisualizerModal,
  showDashcardVisualizerModal,
} from "./visualizer-basics";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE as {
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
  ORDERS: Record<string, number>;
  ORDERS_ID: number;
};

// === extra question fixtures (test-visualizer-data.ts) ===

export const ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY: StructuredQuestionDetails =
  {
    display: "line",
    name: "Orders by Created At (Month) & Category",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
    },
  };

export const PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY: StructuredQuestionDetails =
  {
    display: "bar",
    name: "Products by Created At (Month) and Category",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PRODUCTS.CATEGORY, null],
      ],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
    },
  };

export const PIVOT_TABLE_CARD: StructuredQuestionDetails = {
  name: "Pivot table",
  display: "pivot",
  query: {
    aggregation: [["count"], ["avg", ["field", ORDERS.QUANTITY, null]]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
    "source-table": ORDERS_ID,
  },
};

// === data importer / columns list ===

/** Port of H.dataSource (private in visualizer-basics): the data-source row in
 * the importer whose text contains `dataSourceName`. */
export function dataSource(page: Page, dataSourceName: string): Locator {
  return dataImporter(page)
    .getByTestId("data-source-list-item")
    .filter({ has: page.getByText(dataSourceName, { exact: true }) });
}

/** Port of H.dataSourceColumn (private in visualizer-basics). */
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
 * modal-scoped `input[value=...]` precedent from visualizer-basics.
 */
export async function ensureDisplayIsSelected(page: Page, display: string) {
  await expect(modal(page).locator(`input[value="${display}"]`)).toBeChecked();
}

// === legend ===

/** Port of H.chartLegend. */
export function chartLegend(scope: Page | Locator): Locator {
  return scope.getByLabel("Legend", { exact: true });
}

/** Port of H.chartLegendItems. */
export function chartLegendItems(scope: Page | Locator): Locator {
  return chartLegend(scope).getByTestId("legend-item");
}

// === scoped chart helpers ===

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Port of H.chartPathWithFillColor, scoped to a chart-container ancestor
 * (Cypress called the bare helper inside `.within()` blocks). */
export function chartPathWithFillColor(
  scope: Page | Locator,
  color: string,
): Locator {
  return scope.getByTestId("chart-container").locator(`path[fill="${color}"]`);
}

/** Port of H.trendLine (TREND_LINE_DASH = [5, 5]), scoped. */
export function trendLine(scope: Page | Locator): Locator {
  return scope
    .getByTestId("chart-container")
    .locator(`path[stroke-dasharray='5,5']`);
}

/**
 * ECharts SVG `<text>` carries leading/trailing spaces and Playwright's
 * getByText does NOT trim (unlike testing-library findByText). Anchor a
 * whitespace-tolerant regex so short axis labels stay exact matches (e.g. "10"
 * does not match "1,000"). Scoped to the given chart-container ancestor.
 */
export function echartsTextExact(scope: Page | Locator, text: string): Locator {
  return scope
    .getByTestId("chart-container")
    .getByText(new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`));
}

// === visualizer settings modal ===

/** Port of H.showDashcardVisualizerModalSettings: open the visualizer modal and
 * toggle its settings sidebar. */
export async function showDashcardVisualizerModalSettings(
  page: Page,
  index = 0,
  options: { isVisualizerCard?: boolean } = {},
) {
  await showDashcardVisualizerModal(page, index, options);
  await modal(page).getByTestId("visualizer-settings-button").click();
}

/** Port of H.saveDashcardVisualizerModalSettings (= saveDashcardVisualizerModal). */
export async function saveDashcardVisualizerModalSettings(page: Page) {
  await saveDashcardVisualizerModal(page);
}

// re-exports used by the spec header so the well/scope helpers live in one place
export { getDashboardCard };
