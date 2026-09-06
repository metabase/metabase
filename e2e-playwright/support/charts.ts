/**
 * Ports of the chart / viz-settings `H` helpers used by the scalar and
 * trendline specs:
 * - e2e-viz-settings-helpers.js  (openVizSettingsSidebar)
 * - e2e-ui-elements-helpers.js   (leftSidebar, tooltip)
 * - e2e-visual-tests-helpers.js  (echartsContainer, trendLine)
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Mirrors TREND_LINE_DASH from
 * frontend/src/metabase/visualizations/echarts/cartesian/option/trend-line.ts.
 * The Cypress helper imports the constant directly; this package has no path
 * alias into frontend/src, so the value is inlined.
 */
const TREND_LINE_DASH = [5, 5];

export async function openVizSettingsSidebar(page: Page) {
  await page.getByTestId("viz-settings-button").click();
}

export function leftSidebar(page: Page): Locator {
  return page.getByTestId("sidebar-left");
}

export function tooltip(page: Page): Locator {
  return page.locator(".mb-mantine-Tooltip-tooltip, [role='tooltip']");
}

export function echartsContainer(page: Page): Locator {
  return page.getByTestId("chart-container");
}

export function trendLine(page: Page): Locator {
  return echartsContainer(page).locator(
    `path[stroke-dasharray='${TREND_LINE_DASH.join(",")}']`,
  );
}
