/**
 * Helpers for the chart-drill spec port
 * (e2e/test/scenarios/visualizations-tabular/drillthroughs/chart_drill.cy.spec.js).
 *
 * Only genuinely new helpers live here (PORTING.md rule 9 — parallel agents
 * never edit shared support files). Everything else the spec needs is imported
 * from the existing shared/spec modules:
 *  - cartesianChartCircles (metrics.ts), cartesianChartCircleWithColor /
 *    echartsTriggerBlur / assertEChartsTooltip / visitAdhoc / visitNativeAdhoc
 *    (viz-charts-repros.ts), chartPathWithFillColor / openTable (binning.ts),
 *    pieSlices (dashboard-card-repros.ts), echartsContainer / leftSidebar
 *    (charts.ts), clickActionsPopover (relative-datetime.ts),
 *    addOrUpdateDashboardCard (drillthroughs.ts), createNativeQuestion
 *    (dashboard-management.ts).
 *
 * New here:
 *  - pieSliceWithColor: H.pieSliceWithColor (e2e-visual-tests-helpers.js), the
 *    single missing pie-slice-by-color variant of the ported pieSlices.
 *  - brushChart: the drag-to-filter gesture the spec issues on
 *    query-visualization-root via three cy.trigger mouse events at
 *    element-relative coordinates.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer } from "./charts";

/**
 * Port of H.pieSliceWithColor (e2e-visual-tests-helpers.js): the pie/donut
 * wedge path of a given fill color.
 */
export function pieSliceWithColor(page: Page, color: string): Locator {
  return echartsContainer(page).locator(
    `path[stroke-linejoin='bevel'][fill='${color}']`,
  );
}

/**
 * Port of the spec's `cy.findByTestId("query-visualization-root")
 * .trigger("mousedown", x1, y).trigger("mousemove", x2, y).trigger("mouseup", x2, y)`
 * drag-to-filter gesture. Cypress's trigger coordinates are relative to the
 * element's top-left, so resolve the bounding box and drive the real mouse at
 * absolute coordinates (down at the start, move to the end, up). Real mouse
 * events are what ECharts' brush component hit-tests against.
 */
export async function brushChart(
  page: Page,
  { startX, endX, y }: { startX: number; endX: number; y: number },
) {
  const root = page.getByTestId("query-visualization-root");
  const box = await root.boundingBox();
  if (!box) {
    throw new Error("query-visualization-root has no bounding box");
  }
  await page.mouse.move(box.x + startX, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + endX, box.y + y, { steps: 10 });
  await page.mouse.up();
}
