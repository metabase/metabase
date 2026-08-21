/**
 * Helpers for the legend spec port
 * (e2e/test/scenarios/visualizations-charts/legend.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Two kinds of helper live here:
 *
 * 1. `scatterBubbleWithColor` — a port of the `H` visual-tests helper
 *    (e2e-visual-tests-helpers.js) that has no home in the shared modules yet.
 *    Consolidation candidate: fold into a charts module alongside
 *    chartPathWithFillColor / pieSlices / trendLine.
 * 2. SCOPED forms of the page-level chart-locator helpers. The dashboard test
 *    asserts on a chart *inside a specific dashcard* (Cypress
 *    `H.getDashboardCard(n).within(...)`), so these accept a `scope` (a page or
 *    a dashcard/modal/popover Locator) instead of anchoring at page level like
 *    binning.ts / charts.ts / dashboard-card-repros.ts do.
 */
import type { Locator, Page } from "@playwright/test";

type Scope = Page | Locator;

/**
 * Mirrors TREND_LINE_DASH from
 * frontend/src/metabase/visualizations/echarts/cartesian/option/trend-line.ts —
 * inlined for the same reason charts.ts inlines it (no path alias into
 * frontend/src).
 */
const TREND_LINE_DASH = [5, 5];

/** ECharts SVG chart container, scoped to `scope`. */
export function echartsContainer(scope: Scope): Locator {
  return scope.getByTestId("chart-container");
}

/** Port of H.chartPathWithFillColor, scoped: the chart paths of a fill color. */
export function chartPathWithFillColor(scope: Scope, color: string): Locator {
  return echartsContainer(scope).locator(`path[fill="${color}"]`);
}

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

/** Port of H.scatterBubbleWithColor (e2e-visual-tests-helpers.js), scoped. */
export function scatterBubbleWithColor(scope: Scope, color: string): Locator {
  return echartsContainer(scope).locator(
    `path[d="${CIRCLE_PATH}"][fill="${color}"]`,
  );
}

/** Port of H.pieSlices (e2e-visual-tests-helpers.js), scoped. */
export function pieSlices(scope: Scope): Locator {
  return echartsContainer(scope).locator("path[stroke-linejoin='bevel']");
}

/** Port of H.trendLine (e2e-visual-tests-helpers.js), scoped. */
export function trendLine(scope: Scope): Locator {
  return echartsContainer(scope).locator(
    `path[stroke-dasharray='${TREND_LINE_DASH.join(",")}']`,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The `cy.findByText(...)` axis-label lookups the spec runs inside
 * `H.echartsContainer().within(...)`. ECharts SVG axis `<text>` carries
 * leading/trailing spaces which Playwright's getByText does NOT trim (unlike
 * testing-library), so match with a whitespace-tolerant exact regex — this
 * stays exact ("1,500" never matches "1,500.5") while surviving the padding.
 */
export function echartsText(scope: Scope, text: string): Locator {
  return echartsContainer(scope).getByText(
    new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`),
  );
}

/**
 * Port of the spec-local hideSeries(legendItemIndex): click the (visible-on-
 * legend) "Hide series" control of the index-th legend item within `scope`.
 * findByLabelText string → exact getByLabel (port rule 1).
 */
export async function hideSeries(scope: Scope, legendItemIndex: number) {
  await scope
    .getByTestId("legend-item")
    .nth(legendItemIndex)
    .getByLabel("Hide series", { exact: true })
    .click();
}

/** Port of the spec-local showSeries(legendItemIndex). */
export async function showSeries(scope: Scope, legendItemIndex: number) {
  await scope
    .getByTestId("legend-item")
    .nth(legendItemIndex)
    .getByLabel("Show series", { exact: true })
    .click();
}

/**
 * Port of the spec-local getPieChartLegendItemPercentage(sliceName):
 * `cy.findAllByTestId(`legend-item-${sliceName}`).eq(0).children().eq(1)`.
 * ChartWithLegend renders two legend elements for visual balance, so `.eq(0)`;
 * the percentage is the second direct child.
 */
export function pieChartLegendItemPercentage(
  scope: Scope,
  sliceName: string,
): Locator {
  return scope
    .getByTestId(`legend-item-${sliceName}`)
    .first()
    .locator(":scope > *")
    .nth(1);
}
