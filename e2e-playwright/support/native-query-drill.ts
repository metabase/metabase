/**
 * Helpers for the native-query-drill port
 * (e2e/test/scenarios/question/native-query-drill.cy.spec.ts).
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9); everything else is imported read-only from the shared
 * modules (charts.ts echartsContainer, metrics-explorer.ts applyBrush).
 */
import type { Page } from "@playwright/test";

import { echartsContainer } from "./charts";
import { expect } from "./fixtures";
import { applyBrush } from "./metrics-explorer";

/**
 * Port of H.ensureEchartsContainerHasSvg (e2e-visual-tests-helpers.js): the
 * echarts container has exactly one <svg> child once the chart has drawn.
 */
export async function ensureEchartsContainerHasSvg(page: Page) {
  await expect(echartsContainer(page).locator("svg")).toHaveCount(1);
}

/**
 * Port of the spec-local applyBrushFilter: wait for the chart svg to exist,
 * pause briefly so the brush doesn't grab the svg mid-redraw, then drag the
 * brush horizontally across the chart (H.applyBrush).
 */
export async function applyBrushFilter(
  page: Page,
  { left, right }: { left: number; right: number },
) {
  await ensureEchartsContainerHasSvg(page);
  // wait to avoid grabbing the svg before the chart redraws
  await page.waitForTimeout(100);
  await applyBrush(page, left, right);
}

/**
 * Port of the spec-local applyBoxFilter: draw a rectangular selection on a map
 * visualization (leaflet-draw's rectangle tool → `draw:created`).
 *
 * The Cypress original is
 *   .realMouseDown({ x: left, y: top })
 *   .realMouseMove(right - left, bottom - top)
 *   .realMouseUp({ x: right, y: bottom })
 * and cypress-real-events' realMouseMove(x, y) positions the cursor at (x, y)
 * *relative to the element's top-left* — it is NOT a delta — so the final
 * pointer position is element-relative (right - left, bottom - top), i.e.
 * (400, 400), not (right, bottom). leaflet-draw takes the rectangle bounds from
 * the shape's last mousemove (the mouseup coordinate is ignored), so the
 * effective box is (left, top) → (right - left, bottom - top). Porting the
 * mouseup coordinate as the box corner draws a larger box and catches an extra
 * point (2 rows instead of 1).
 */
export async function applyBoxFilter(
  page: Page,
  {
    top,
    left,
    right,
    bottom,
  }: { top: number; left: number; right: number; bottom: number },
) {
  // wait to avoid grabbing the svg before the chart redraws
  await page.waitForTimeout(100);

  const box = await page.getByTestId("visualization-root").boundingBox();
  if (!box) {
    throw new Error("visualization-root is not visible");
  }
  await page.mouse.move(box.x + left, box.y + top);
  await page.mouse.down();
  await page.mouse.move(box.x + (right - left), box.y + (bottom - top), {
    steps: 10,
  });
  await page.mouse.up();
}
