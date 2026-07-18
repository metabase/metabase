/**
 * Spec-local helpers for the pie_chart port
 * (e2e/test/scenarios/visualizations-charts/pie_chart.cy.spec.js).
 *
 * Kept in their own module per the porting rules (parallel agents never edit
 * shared support files). These are ports of the spec-private functions
 * (ensurePieChartRendered, checkLegendItemAriaCurrent, getLimitedQuery,
 * changeRowLimit, confirmSliceClickBehavior) plus a small renameSlice helper
 * for the slice-settings rename dance. Shared `H` helpers (pieSlices,
 * chartPathWithFillColor, assertEChartsTooltip, etc.) are imported from the
 * existing support modules.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { echartsContainer } from "./charts";
import { pieSlices } from "./dashboard-card-repros";
import { findByDisplayValue } from "./filters-repros";
import { getNotebookStep, openNotebook, visualize } from "./notebook";
import { main } from "./viz-tabular-repros";

/**
 * Port of the spec-local ensurePieChartRendered(rows, middleRows, outerRows,
 * totalValue). Scoped to query-visualization-root like the original's
 * `within` block. `pieSlices` counts the wedge paths; the legend loop asserts
 * each ring-0 name is visible (cy.contains → case-sensitive substring).
 */
export async function ensurePieChartRendered(
  page: Page,
  rows: string[],
  middleRows?: string[] | null,
  outerRows?: string[] | null,
  totalValue?: number | null,
) {
  const root = page.getByTestId("query-visualization-root");

  // detail
  if (totalValue != null) {
    await expect(root.getByText("Total", { exact: true }).first()).toBeVisible();
    await expect(
      root.getByText(String(totalValue), { exact: true }).first(),
    ).toBeVisible();
  }

  // slices
  let rowCount = rows.length;
  const hasMiddleRows = middleRows != null && middleRows.length > 0;
  const hasOuterRows = outerRows != null && outerRows.length > 0;

  if (hasMiddleRows) {
    rowCount += rows.length * middleRows.length;
  }
  if (hasMiddleRows && hasOuterRows) {
    rowCount += rows.length * middleRows.length * outerRows.length;
  }
  await expect(pieSlices(page)).toHaveCount(rowCount);

  // legend
  for (const name of rows) {
    await expect(
      root
        .getByTestId("legend-item")
        .filter({ hasText: caseSensitive(name) })
        .first(),
    ).toBeVisible();
  }
}

/** Case-sensitive substring matcher (Cypress cy.contains semantics). */
function caseSensitive(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/**
 * Port of the spec-local checkLegendItemAriaCurrent. aria-current is an
 * enumerated attribute ("true"/"false"), not a boolean, so the string value
 * assertion ports literally.
 */
export async function checkLegendItemAriaCurrent(
  page: Page,
  title: string,
  value: string,
) {
  await expect(
    page.getByTestId("chart-legend").getByTestId(`legend-item-${title}`),
  ).toHaveAttribute("aria-current", value);
}

/** Port of the spec-local getLimitedQuery. */
export function getLimitedQuery<T extends { query: Record<string, unknown> }>(
  query: T,
  limit: number,
): T {
  return {
    ...query,
    query: {
      ...query.query,
      limit,
    },
  };
}

/**
 * Port of the spec-local changeRowLimit: edit the notebook limit step and
 * re-visualize. The Cypress original uses `findByDisplayValue(from)` +
 * `.type("{selectall}${to}")` + realPress("Tab").
 */
export async function changeRowLimit(page: Page, from: number, to: number) {
  await openNotebook(page);
  const step = getNotebookStep(page, "limit");
  const input = step.locator("input").first();
  await expect(input).toHaveValue(String(from));
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.pressSequentially(String(to));
  await input.press("Tab");
  await visualize(page);
}

/**
 * Port of the slice-settings rename: click the slice's settings button, then
 * replace the name in the display-value input and blur (realPress("Tab")).
 */
export async function renameSlice(page: Page, from: string, to: string) {
  await page.getByTestId(`${from}-settings-button`).click();
  const input = await findByDisplayValue(page.locator("body"), from);
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.pressSequentially(to);
  await input.press("Tab");
}

/**
 * Port of the spec-local confirmSliceClickBehavior: click the slice (by label,
 * optionally the elementIndex-th), assert the click-behavior URL navigation,
 * assert the "lost" page, then go back.
 */
export async function confirmSliceClickBehavior(
  page: Page,
  sliceLabel: string,
  value: number,
  elementIndex?: number,
) {
  const container = echartsContainer(page);
  const target =
    elementIndex == null
      ? container.getByText(sliceLabel, { exact: true })
      : container.getByText(sliceLabel, { exact: true }).nth(elementIndex);
  await target.click({ force: true });

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/question/${value}`);
  await expect(main(page).getByText("We're a little lost...")).toBeVisible();
  await page.goBack();
}
