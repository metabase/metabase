/**
 * Metric-page and dimension-list helpers, ported from
 * e2e-metric-page-helpers.ts, e2e-dimension-list-helpers.js,
 * e2e-bi-basics-helpers.js, and e2e-visual-tests-helpers.js.
 */
import { Locator, Page, expect } from "@playwright/test";

import { echartsContainer } from "./charts";
import { popover } from "./ui";

export const MetricPage = {
  header: (page: Page) => page.getByTestId("metric-header"),
  moreMenu: (page: Page) => page.getByLabel("More options"),
  aboutPage: (page: Page) => page.getByTestId("metric-about-page"),
};

export function undoToast(page: Page): Locator {
  return page.getByTestId("toast-undo");
}

/** Port of H.visitMetric: navigate and wait for the metric's query. */
export async function visitMetric(page: Page, id: number) {
  const query = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/card/${id}/query`,
  );
  await page.goto(`/metric/${id}`);
  await query;
}

/** Port of H.filter({ mode: "notebook" }) from e2e-bi-basics-helpers.js. */
export async function filterInNotebook(page: Page) {
  await page.getByTestId("action-buttons").locator(".Icon-filter").click();
}

/** Port of the dnd circle selector from e2e-visual-tests-helpers.js. */
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";

export function cartesianChartCircles(page: Page): Locator {
  return echartsContainer(page).locator(`path[d="${CIRCLE_PATH}"]`);
}

/**
 * Port of H.changeBinningForDimension: hover the dimension row, click its
 * binning button, pick the new binning from the popover.
 */
export async function changeBinningForDimension(
  page: Page,
  {
    name,
    fromBinning,
    toBinning,
  }: { name: string; fromBinning?: string; toBinning: string },
) {
  const dimension = page
    .getByTestId("dimension-list-item")
    .filter({ hasText: name })
    .first();
  await dimension.hover();
  const binningButton = dimension.getByTestId("dimension-list-item-binning");
  if (fromBinning) {
    await expect(binningButton).toHaveText(fromBinning);
  }
  await binningButton.click({ force: true });
  await popover(page).getByText(toBinning, { exact: true }).click();
}
