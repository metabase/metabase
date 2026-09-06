/**
 * Helpers for the boxplot spec port
 * (e2e/test/scenarios/visualizations-charts/boxplot.cy.spec.js).
 *
 * New helpers for this spec only, per the porting rules (parallel agents never
 * edit shared support files). Ports of H.BoxPlot (e2e-visual-tests-helpers.js)
 * plus the Cypress chart-position action shims (`.trigger("mousemove", "left")`,
 * `.click("left")`, `realHover({ position: "top" })`) that the boxplot tests use
 * to dodge the mean-marker overlap in the middle of each box.
 *
 * Everything else (echartsContainer, assertEChartsTooltip, triggerMousemove,
 * openSeriesSettings, echartsExactText, …) is imported read-only from the shared
 * modules.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer } from "./charts";

// Mirrors the CIRCLE_PATH / DIAMOND_PATH constants in e2e-visual-tests-helpers.js
// — the exact `d` attributes ECharts renders for the outlier circle markers and
// the diamond mean markers.
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
const DIAMOND_PATH = "M0 -1L1 0L0 1L-1 0Z";

/** Port of H.BoxPlot.getBoxes(): the box <path>s (translucent fill + stroke). */
export function getBoxes(page: Page): Locator {
  return echartsContainer(page).locator('path[fill-opacity="0.15"][stroke]');
}

/** Port of H.BoxPlot.getPoints(): the outlier / all-points circle markers. */
export function getPoints(page: Page): Locator {
  return echartsContainer(page).locator(`path[d="${CIRCLE_PATH}"]`);
}

/** Port of H.BoxPlot.getMeanMarkers(): the diamond mean markers. */
export function getMeanMarkers(page: Page): Locator {
  return echartsContainer(page).locator(`path[d="${DIAMOND_PATH}"]`);
}

/**
 * Port of Cypress `.trigger("mousemove", "left")` on a box <path>: a synthetic
 * mousemove dispatched at the element's LEFT-center. `.trigger` is a synthetic
 * dispatch (like line-chart.ts triggerMousemove — the wave-13 gotcha), and
 * ECharts hit-tests the tooltip from the event coordinate. The boxplot tests
 * hover the left edge so the tooltip resolves to the box, not the mean marker
 * that overlays its center.
 */
export async function triggerMousemoveLeft(element: Locator) {
  await element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: rect.x + 1,
        clientY: rect.y + rect.height / 2,
      }),
    );
  });
}

/**
 * Port of Cypress `.click("left")`: a real click on the left side of a box
 * (to dodge the mean marker at its horizontal center). Cypress's "left" is the
 * left-center of the bounding box, but the box <path>'s bounding box spans the
 * whiskers, so its extreme-left edge (x≈0) is a 1px stroke line that hit-tests
 * to bare <svg>. Click a fifth of the way in instead — still left of the center
 * marker, but squarely inside the translucent fill so ECharts registers it.
 */
export async function clickLeft(element: Locator) {
  const box = await element.boundingBox();
  if (!box) {
    throw new Error("clickLeft: element has no bounding box");
  }
  await element.click({ position: { x: box.width * 0.2, y: box.height / 2 } });
}

/**
 * Port of `H.echartsContainer().realHover({ position: "top" })`: move the real
 * mouse to the chart's top-center to reset ECharts focus/blur state after a
 * legend show/hide (so the box count settles back).
 */
export async function hoverChartTop(page: Page) {
  const box = await echartsContainer(page).boundingBox();
  if (!box) {
    throw new Error("hoverChartTop: chart container has no bounding box");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + 1);
}
