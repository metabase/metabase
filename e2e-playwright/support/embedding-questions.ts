/**
 * Helpers for the embedding-questions spec port (static "guest" embedding of a
 * saved QUESTION). NEW helpers live here (parallel-agent rule: no edits to
 * shared modules — everything else is imported read-only from
 * support/embedding.ts / support/embedding-dashboard.ts / support/charts.ts).
 *
 * Ports of:
 * - the fixtures in e2e/test/scenarios/embedding/shared/embedding-questions.js
 *   (regularQuestion / questionWithAggregation / joinedQuestion). The
 *   `questionAsPinMapWithTiles` fixture there is unused by this spec so it's
 *   omitted.
 * - the downloads describe's module-level `questionDetails` (a native question
 *   with a single free-text template tag).
 * - the spec-local assertOnXYAxisLabels plus the ECharts helpers this spec
 *   needs against the embed IFRAME. The shared charts.ts / viz-tabular-repros.ts
 *   ports are Page-scoped; these accept a Scope (Page | FrameLocator) because
 *   H.visitIframe frames the embed and the chart renders inside the iframe.
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import { SAMPLE_DATABASE } from "./sample-data";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE as {
  ORDERS: Record<string, number>;
  ORDERS_ID: number;
  PEOPLE: Record<string, number>;
  PEOPLE_ID: number;
};

/** A locator root that can host the embed iframe's contents. */
export type Scope = Page | FrameLocator;

// === shared/embedding-questions.js fixtures ===

export const regularQuestion = {
  name: "Orders4t#7 t3",
  description: "Foo",
  query: {
    "source-table": ORDERS_ID,
    limit: 5,
    expressions: { Math: ["+", 1, 1] },
  },
  visualization_settings: {
    column_settings: {
      [`["ref",["field",${ORDERS.CREATED_AT},null]]`]: {
        date_abbreviate: true,
        date_style: "dddd, MMMM D, YYYY",
        time_enabled: "seconds",
        time_style: "HH:mm",
      },
      [`["ref",["field",${ORDERS.TOTAL},null]]`]: {
        column_title: "Billed",
        number_style: "currency",
        currency_in_header: false,
        currency: "EUR",
        currency_style: "symbol",
      },
      [`["ref",["field",${ORDERS.TAX},null]]`]: { show_mini_bar: true },
    },
  },
};

export const questionWithAggregation = {
  ...regularQuestion,
  query: {
    ...regularQuestion.query,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      ["expression", "Math", null],
    ],
  },
  display: "line",
};

export const joinedQuestion = {
  ...regularQuestion,
  query: {
    ...regularQuestion.query,
    joins: [
      {
        fields: "all",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "User" }],
        ],
        alias: "User",
      },
    ],
  },
};

// === downloads describe fixture ===

/** Port of the downloads describe's module-level `questionDetails`. */
export const downloadsQuestionDetails = {
  name: "Simple SQL Query for Embedding",
  native: {
    query: "select {{text}} as WYSIWYG",
    "template-tags": {
      text: {
        id: "fake-uuid",
        name: "text",
        "display-name": "Text",
        type: "text",
        default: null as unknown,
      },
    },
  },
};

// === scope-aware ECharts helpers (Page | embed FrameLocator) ===

/** Scope-aware port of H.echartsContainer (testid "chart-container"). */
export function echartsContainer(scope: Scope): Locator {
  return scope.getByTestId("chart-container");
}

/** Scope-aware port of H.cartesianChartCircle: the line/area data points. */
const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
export function cartesianChartCircles(scope: Scope): Locator {
  return echartsContainer(scope).locator(`path[d="${CIRCLE_PATH}"]`);
}

/** Scope-aware port of H.echartsTooltip (may keep two DOM instances). */
export function echartsTooltip(scope: Scope): Locator {
  return scope.getByTestId("echarts-tooltip").filter({ visible: true });
}

/**
 * Port of the spec-local assertOnXYAxisLabels: the ECharts SVG renders the axis
 * labels as <text> nodes inside the container. `.get("text").contains(label)`
 * is a substring existence check → toContainText.
 */
export async function assertOnXYAxisLabels(
  scope: Scope,
  { xLabel, yLabel }: { xLabel: string; yLabel: string },
) {
  await expect(echartsContainer(scope)).toContainText(xLabel);
  await expect(echartsContainer(scope)).toContainText(yLabel);
}

type TooltipRow = { name: string; value?: string; index?: number };

/**
 * Scope-aware port of H.assertEChartsTooltip ({ header, rows }) — only the
 * header/rows branches this spec uses.
 */
export async function assertEChartsTooltip(
  scope: Scope,
  { header, rows }: { header?: string; rows?: TooltipRow[] },
) {
  const tooltip = echartsTooltip(scope);

  if (header != null) {
    await expect(
      tooltip.getByTestId("echarts-tooltip-header"),
    ).toHaveText(header);
  }

  if (rows != null) {
    for (const { name, value, index } of rows) {
      const row = tooltip
        .getByText(name, { exact: true })
        .nth(index ?? 0)
        .locator("xpath=ancestor-or-self::tr[1]");
      if (value) {
        await expect(row.getByText(value, { exact: true })).toBeVisible();
      }
    }
  }
}

/**
 * Port of Cypress `.trigger("mousemove")` on an ECharts element (wave-13:
 * `.trigger("mousemove")` → synthetic MouseEvent dispatch, not a real hover —
 * ECharts hit-tests the tooltip from the event's client coords). Dispatch at
 * the element center, mirroring Cypress's default trigger position.
 */
export async function triggerMousemove(element: Locator) {
  await element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2,
      }),
    );
  });
}

/**
 * Scope-aware Mantine tooltip locator (port of H.tooltip against the embed
 * iframe: the tooltip portal renders inside the embed document).
 */
export function tooltip(scope: Scope): Locator {
  return scope
    .locator(".mb-mantine-Tooltip-tooltip, [role='tooltip']")
    .filter({ visible: true });
}
