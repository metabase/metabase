/**
 * Helpers for the line-bar-tooltips spec port
 * (e2e/test/scenarios/visualizations-charts/line-bar-tooltips.cy.spec.js).
 *
 * Own module per the porting rules — imports the shared chart/tooltip/dashboard
 * helpers read-only. Ports the spec-local module functions:
 *  - setup / setupDashboard (create question(s) + dashboard + dashcard)
 *  - showTooltipForCircleInSeries / showTooltipForBarInSeries
 *  - testTooltipExcludesText
 *  - updateColumnTitle
 *  - the shared test*Change tooltip assertions
 *
 * IMPORTANT fidelity note: the Cypress `H.tooltipHeader(x)` helper takes NO
 * arguments (e2e-visual-tests-helpers.js:184) — it just returns the header
 * element and asserts nothing. So the `test*Change` helpers below assert ONLY
 * the rows; porting their `H.tooltipHeader("2025")` no-ops as real header
 * assertions would strengthen the test (e.g. the index-1 avg-of-total header is
 * really 2026 while upstream "asserts" 2025). Direct `H.assertEChartsTooltip({
 * header })` calls in the spec DO assert the header and are ported as such.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { addOrUpdateDashboardCard } from "./dashboard-management";
import { createDashboard, createQuestion } from "./factories";
import type { StructuredQuestionDetails } from "./factories";
import { findByDisplayValue } from "./filters-repros";
import { chartPathWithFillColor } from "./legend";
import { triggerMousemove } from "./line-chart";
import {
  assertEChartsTooltip,
  cartesianChartCircleWithColor,
  echartsTooltip,
  echartsTriggerBlur,
} from "./viz-charts-repros";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TooltipSelector = (
  page: Page,
  seriesColor: string,
  index?: number,
) => Promise<void>;

/**
 * Port of the spec-local showTooltipForCircleInSeries. `.trigger("mousemove")`
 * on a chart circle is a synthetic MouseEvent dispatch, not a real hover
 * (wave-13 rule), so it maps to triggerMousemove.
 */
export const showTooltipForCircleInSeries: TooltipSelector = async (
  page,
  seriesColor,
  index = 0,
) => {
  await echartsTriggerBlur(page);
  await triggerMousemove(cartesianChartCircleWithColor(page, seriesColor).nth(index));
};

/**
 * Port of the spec-local showTooltipForBarInSeries. Upstream uses `.realHover()`
 * on the bar path, so this is a real hover().
 */
export const showTooltipForBarInSeries: TooltipSelector = async (
  page,
  seriesColor,
  index = 0,
) => {
  await echartsTriggerBlur(page);
  await chartPathWithFillColor(page, seriesColor).nth(index).hover();
};

/**
 * Port of the spec-local testTooltipExcludesText: `cy.contains(text)` is a
 * case-sensitive substring match, so this uses a case-sensitive regex getByText
 * (not exact).
 */
export async function testTooltipExcludesText(page: Page, text: string) {
  await expect(
    echartsTooltip(page).getByText(new RegExp(escapeRegExp(text))),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local updateColumnTitle: find the chart-settings input with
 * the original series title, replace it, blur to commit.
 */
export async function updateColumnTitle(
  page: Page,
  originalText: string,
  updatedText: string,
) {
  const container = page.getByTestId("chartsettings-list-container");
  const input = await findByDisplayValue(container, originalText);
  await input.fill(updatedText);
  await input.blur();
}

type SetupOptions = {
  question: StructuredQuestionDetails;
  addedSeriesQuestion?: StructuredQuestionDetails;
  cardSize?: { x: number; y: number };
};

/**
 * Port of the spec-local setup + setupDashboard: create the question (and an
 * optional added-series question), a dashboard, and a single dashcard wiring
 * them together. Returns the dashboard id.
 */
export async function setup(
  api: MetabaseApi,
  { question, addedSeriesQuestion, cardSize = { x: 24, y: 12 } }: SetupOptions,
): Promise<number> {
  const { id: card1Id } = await createQuestion(api, question);

  let addedSeriesCardId: number | null = null;
  if (addedSeriesQuestion) {
    const { id } = await createQuestion(api, addedSeriesQuestion);
    addedSeriesCardId = id;
  }

  const { id: dashboardId } = await createDashboard(api);
  await addOrUpdateDashboardCard(api, {
    dashboard_id: dashboardId,
    card_id: card1Id,
    card: {
      size_x: cardSize.x,
      size_y: cardSize.y,
      series: addedSeriesCardId != null ? [{ id: addedSeriesCardId }] : [],
    },
  });

  return dashboardId;
}

// === shared tooltip assertions (test*Change) ===
// Rows only — no header assertion (see the fidelity note in the file header).

export async function testSumTotalChange(
  page: Page,
  tooltipSelector: TooltipSelector = showTooltipForCircleInSeries,
  seriesName = "Sum of Total",
) {
  await tooltipSelector(page, "#88BF4D", 0);
  await assertEChartsTooltip(page, {
    rows: [{ color: "#88BF4D", name: seriesName, value: "42,156.87" }],
  });

  await tooltipSelector(page, "#88BF4D", 1);
  await assertEChartsTooltip(page, {
    rows: [
      {
        color: "#88BF4D",
        name: seriesName,
        value: "205,256.02",
        secondaryValue: "+386.89%",
      },
    ],
  });
}

export async function testAvgTotalChange(
  page: Page,
  tooltipSelector: TooltipSelector = showTooltipForCircleInSeries,
  seriesName = "Average of Total",
) {
  await tooltipSelector(page, "#A989C5", 0);
  await assertEChartsTooltip(page, {
    rows: [{ color: "#A989C5", name: seriesName, value: "56.66" }],
  });

  await tooltipSelector(page, "#A989C5", 1);
  await assertEChartsTooltip(page, {
    rows: [
      {
        color: "#A989C5",
        name: seriesName,
        value: "56.86",
        secondaryValue: "+0.34%",
      },
    ],
  });
}

export async function testCumSumChange(
  page: Page,
  testFirstTooltip = true,
  seriesName = "Cumulative sum of Quantity",
) {
  // In the multi-series-with-added-question spec, this first circle ends up
  // hidden behind another circle, so it is skipped there.
  if (testFirstTooltip) {
    await showTooltipForCircleInSeries(page, "#88BF4D", 0);
    await assertEChartsTooltip(page, {
      rows: [{ color: "#88BF4D", name: seriesName, value: "3,236" }],
    });
  }

  await showTooltipForCircleInSeries(page, "#88BF4D", 1);
  await assertEChartsTooltip(page, {
    rows: [
      {
        color: "#88BF4D",
        name: seriesName,
        value: "17,587",
        secondaryValue: "+443.48%",
      },
    ],
  });
}

export async function testAvgDiscountChange(
  page: Page,
  seriesName = "Average of Discount",
) {
  await showTooltipForCircleInSeries(page, "#509EE3", 0);
  await assertEChartsTooltip(page, {
    rows: [{ color: "#509EE3", name: seriesName, value: "5.03" }],
  });

  await showTooltipForCircleInSeries(page, "#509EE3", 1);
  await assertEChartsTooltip(page, {
    rows: [
      {
        color: "#509EE3",
        name: seriesName,
        value: "5.41",
        secondaryValue: "+7.54%",
      },
    ],
  });
}

export async function testSumDiscountChange(
  page: Page,
  seriesName = "Sum of Discount",
) {
  await showTooltipForCircleInSeries(page, "#98D9D9", 0);
  await assertEChartsTooltip(page, {
    rows: [{ color: "#98D9D9", name: seriesName, value: "342.09" }],
  });

  await showTooltipForCircleInSeries(page, "#98D9D9", 1);
  await assertEChartsTooltip(page, {
    rows: [
      {
        color: "#98D9D9",
        name: seriesName,
        value: "1,953.08",
        secondaryValue: "+470.93%",
      },
    ],
  });
}
