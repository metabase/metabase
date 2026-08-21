/**
 * Helpers for the waterfall spec port
 * (e2e/test/scenarios/visualizations-charts/waterfall.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Everything else the spec needs is imported read-only
 * from the shared modules; only the spec-local helpers and the one un-ported
 * `H` helper (assertEChartsTooltipNotContain) live here.
 *
 * assertEChartsTooltipNotContain is a consolidation candidate — fold it next to
 * assertEChartsTooltip in viz-charts-repros.ts.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer, leftSidebar } from "./charts";
import { expect } from "./fixtures";
import { chartPathWithFillColor } from "./legend";
import { caseSensitiveSubstring } from "./text";
import { icon } from "./ui";
import { echartsTooltip } from "./viz-charts-repros";

/**
 * Port of the spec-local verifyWaterfallRendering. The Cypress
 * `H.echartsContainer().get("text").contains(label)` is a case-sensitive
 * substring lookup, and the two `chartPathWithFillColor().should("be.visible")`
 * calls are any-of-set visibility assertions (port rule 3: a single-point
 * series renders a zero-extent path Playwright rightly calls hidden).
 */
export async function verifyWaterfallRendering(
  page: Page,
  xLabel: string | null = null,
  yLabel: string | null = null,
) {
  // A bar (increase color).
  await expect(
    chartPathWithFillColor(page, "#88BF4D").filter({ visible: true }).first(),
  ).toBeVisible();
  // Total bar.
  await expect(
    chartPathWithFillColor(page, "#303D46").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    echartsContainer(page).getByText(caseSensitiveSubstring("Total")).first(),
  ).toBeVisible();

  if (xLabel) {
    await expect(
      echartsContainer(page)
        .getByText(caseSensitiveSubstring(xLabel))
        .first(),
    ).toBeVisible();
  }
  if (yLabel) {
    await expect(
      echartsContainer(page)
        .getByText(caseSensitiveSubstring(yLabel))
        .first(),
    ).toBeVisible();
  }
}

/**
 * Port of the spec-local switchToWaterfallDisplay: expand the "more charts"
 * section if collapsed, pick the waterfall type from the left sidebar's viz
 * picker, then open its settings via the gear in the Waterfall-container.
 */
export async function switchToWaterfallDisplay(page: Page) {
  const sidebar = leftSidebar(page);
  const toggle = sidebar.getByTestId("more-charts-toggle");
  if ((await toggle.count()) > 0) {
    const expanded = await toggle
      .locator("xpath=ancestor-or-self::*[@aria-expanded][1]")
      .getAttribute("aria-expanded");
    if (expanded === "false") {
      await toggle.click();
    }
  }
  await icon(sidebar, "waterfall").click();
  await icon(page.getByTestId("Waterfall-container"), "gear").click();
}

/**
 * Port of the spec-local getWaterfallDataLabels: `paint-order='stroke'` targets
 * the waterfall data labels only.
 */
export function getWaterfallDataLabels(page: Page): Locator {
  return echartsContainer(page).locator("text[paint-order='stroke']");
}

/**
 * How many form controls inside `scope` currently have `value` as their value —
 * the count side of cy.findByDisplayValue (getByDisplayValue is absent from
 * these Playwright types). Wrap in `expect.poll` for the retried
 * should("exist") / should("not.exist") assertions; use
 * filters-repros.findByDisplayValue for the click targets.
 */
export async function countDisplayValue(
  scope: Locator,
  value: string,
): Promise<number> {
  const controls = scope.locator("input, textarea, select");
  const count = await controls.count();
  let matches = 0;
  for (let index = 0; index < count; index++) {
    if ((await controls.nth(index).inputValue()) === value) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * Port of H.assertEChartsTooltipNotContain (e2e-visual-tests-helpers.js): none
 * of `rows` appear in the current tooltip. Cypress findByText is exact.
 */
export async function assertEChartsTooltipNotContain(
  page: Page,
  rows: string[],
) {
  const tooltip = echartsTooltip(page);
  for (const row of rows) {
    await expect(tooltip.getByText(row, { exact: true })).toHaveCount(0);
  }
}
