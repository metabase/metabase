/**
 * Helpers for the visualizer-drillthrough spec port
 * (e2e/test/scenarios/dashboard/visualizer/drillthrough.cy.spec.ts).
 *
 * NEW helpers only (parallel-agent rule: no edits to shared modules). The
 * shared visualizer surface (question fixtures, createDashboardWithVisualizerDashcards,
 * chartPathWithFillColor, chartLegendItem, …) is imported read-only by the spec
 * from support/visualizer-basics.ts / support/visualizer-cartesian.ts.
 *
 * This module adds only what those don't export, and only in *scoped* form —
 * the drillthrough spec runs every chart interaction inside
 * `H.getDashboardCard(n).within(...)`, and a dashboard renders six
 * chart-containers, so the page-global ports in charts.ts / metrics-explorer.ts
 * would violate strict mode:
 *  - cartesianChartCircleWithColor (e2e-visual-tests-helpers.js) — the page
 *    version lives in viz-charts-repros.ts but is unscoped.
 *  - applyBrush (e2e-visual-tests-helpers.js) — the page version lives in
 *    metrics-explorer.ts but is unscoped.
 *  - waitForDataset — the @dataset intercept + cy.wait pattern (register before
 *    the triggering action, await after; PORTING rule 2).
 */
import type { Locator, Page, Response } from "@playwright/test";

// Mirrors CIRCLE_PATH in e2e-visual-tests-helpers.js — the line/area
// data-point marker path.
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

/**
 * Port of H.cartesianChartCircleWithColor, scoped to a dashcard (the Cypress
 * spec calls the bare helper inside `H.getDashboardCard(n).within(...)`). The
 * Cypress helper appends `.should("be.visible")`; call sites add the equivalent
 * (a click's actionability check waits for the same).
 */
export function cartesianChartCircleWithColor(
  scope: Locator,
  color: string,
): Locator {
  return scope
    .getByTestId("chart-container")
    .locator(`path[d="${CIRCLE_PATH}"][stroke="${color}"]`);
}

/**
 * Port of H.applyBrush(left, right), scoped to a dashcard. Cypress fires
 * synthetic mousedown/mousemove/mouseup at coordinates relative to the
 * echartsContainer; the real-mouse equivalent (same as metrics-explorer's
 * page-global applyBrush) drags across the chart at y=100.
 */
export async function applyBrush(scope: Locator, left: number, right: number) {
  const container = scope.getByTestId("chart-container");
  const box = await container.boundingBox();
  if (!box) {
    throw new Error("chart container is not visible");
  }
  const page = container.page();
  const y = box.y + 100;
  await page.mouse.move(box.x + left, y);
  await page.mouse.down();
  await page.mouse.move(box.x + right, y, { steps: 10 });
  await page.mouse.up();
}

/**
 * The @dataset intercept: POST /api/dataset. Register BEFORE the triggering
 * action, await after (PORTING rule 2).
 */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/**
 * A running counter of POST /api/dataset requests, for the VIZ-979 assertion
 * that a brush on a multi-series chart fires none (`cy.get("@dataset.all")
 * .should("have.length", 0)`). Returns a getter and a disposer.
 */
export function trackDatasetRequests(page: Page): {
  count: () => number;
  dispose: () => void;
} {
  let count = 0;
  const handler = (request: import("@playwright/test").Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/dataset"
    ) {
      count += 1;
    }
  };
  page.on("request", handler);
  return {
    count: () => count,
    dispose: () => page.off("request", handler),
  };
}
