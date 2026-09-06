/**
 * Helpers for the row-chart spec port
 * (e2e/test/scenarios/visualizations-charts/rows.cy.spec.js).
 *
 * The row chart is a visx (not ECharts) SVG: the bars are the
 * `[role="graphics-symbol"]` marks, `.visx-columns` is the plotted bars group
 * and `.visx-axis-left` is the left (category) axis. Cypress read their sizes
 * with jQuery `.invoke("width")`; the faithful Playwright form is
 * `boundingBox().width`.
 *
 * Kept in its own module (porting rule 9) — fold into charts.ts at
 * consolidation if row-chart specs multiply.
 */
import type { Locator } from "@playwright/test";

/** Port of `cy.findByTestId("query-visualization-root")`. */
export function queryVisualizationRoot(scope: {
  getByTestId(id: string): Locator;
}): Locator {
  return scope.getByTestId("query-visualization-root");
}

/** The row-chart bars — `cy.findAllByRole("graphics-symbol")`. */
export function rowChartBars(scope: Locator): Locator {
  return scope.locator('[role="graphics-symbol"]');
}

/** The plotted-bars group — `cy.get(".visx-columns")`. */
export function visxColumns(scope: Locator): Locator {
  return scope.locator(".visx-columns");
}

/** The left (category) axis group — `cy.get(".visx-axis-left")`. */
export function visxAxisLeft(scope: Locator): Locator {
  return scope.locator(".visx-axis-left");
}

/** jQuery `.invoke("width")` equivalent: the element's rendered box width. */
export async function boxWidth(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error("boxWidth: element has no bounding box");
  }
  return box.width;
}
