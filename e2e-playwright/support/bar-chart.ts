/**
 * Helpers for the bar-chart spec port
 * (e2e/test/scenarios/visualizations-charts/bar_chart.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). These are ports of `H` visual-tests helpers that have
 * no home in the shared modules yet — consolidation candidates: fold into
 * charts.ts / legend.ts alongside chartPathWithFillColor / getValueLabels /
 * otherSeriesChartPaths.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { chartPathWithFillColor } from "./legend";

type Scope = Page | Locator;

/**
 * Port of H.getValueLabels (e2e-visual-tests-helpers.js): the ECharts data
 * value labels (`text[stroke-width='3']`), scoped so the #33725 dashcard
 * `within` block maps to a scoped Locator.
 */
export function getValueLabels(scope: Scope): Locator {
  return scope.getByTestId("chart-container").locator("text[stroke-width='3']");
}

/**
 * Port of H.otherSeriesChartPaths (e2e-visual-tests-helpers.js): the grouped
 * "Other" series paths, colored `#949AAB`. Only used by the @skip test, but
 * needed for that body to type-check.
 */
export function otherSeriesChartPaths(scope: Scope): Locator {
  return chartPathWithFillColor(scope, "#949AAB");
}

/**
 * Port of `H.chartPathWithFillColor(color).should("be.visible")`. `.should(
 * "be.visible")` on a multi-element subject is an ANY-of assertion (PORTING
 * rule 3): a color's bar set can include a zero-extent path Playwright rightly
 * calls hidden, so assert "at least one match is visible".
 */
export async function expectChartPathVisible(scope: Scope, color: string) {
  await expect(
    chartPathWithFillColor(scope, color).filter({ visible: true }).first(),
  ).toBeVisible();
}
