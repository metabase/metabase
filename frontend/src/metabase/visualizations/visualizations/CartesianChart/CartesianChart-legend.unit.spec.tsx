import userEvent from "@testing-library/user-event";

import {
  countChartElements,
  expectTooltip,
  getChartTexts,
  hoverChartElement,
} from "__support__/echarts-interaction";
import { screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { TREND_LINE_WIDTH } from "metabase/viz-core";
import type { DatasetColumn } from "metabase-types/api";
import { createMockColumn, createMockInsight } from "metabase-types/api/mocks";

import {
  createDateColumn,
  createMetricColumn,
  createSeries,
  setupChart,
} from "./tests/test-utils";

registerVisualizations();

const YEARS = [2025, 2026, 2027, 2028, 2029].map(
  (year) => `${year}-01-01T00:00:00-08:00`,
);

const CATEGORY_COLORS = {
  Doohickey: "#88BF4D",
  Gadget: "#F9D45C",
  Gizmo: "#A989C5",
  Widget: "#F2A86F",
};
type Category = keyof typeof CATEGORY_COLORS;
const CATEGORIES: Category[] = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const CREATED_AT_YEAR = createDateColumn("CREATED_AT", "year");
const COUNT = createMetricColumn("count", "Count", "type/BigInteger");

function createCategoryColumn(name: string, displayName: string) {
  return createMockColumn({
    name,
    display_name: displayName,
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    source: "breakout",
  });
}

const CATEGORY = createCategoryColumn("CATEGORY", "Product → Category");

// Doohickey alone tops out under 1.5k, the others above it
const COUNTS_BY_CATEGORY: Record<Category, number[]> = {
  Doohickey: [177, 600, 900, 1150, 1400],
  Gadget: [199, 700, 1050, 1350, 1700],
  Gizmo: [158, 650, 1000, 1300, 1650],
  Widget: [210, 710, 1060, 1360, 1690],
};

const COUNT_BY_YEAR_AND_CATEGORY = createSeries({
  display: "bar",
  cols: [CREATED_AT_YEAR, CATEGORY, COUNT],
  rows: YEARS.flatMap((year, yearIndex) =>
    CATEGORIES.map((category) => [
      year,
      category,
      COUNTS_BY_CATEGORY[category][yearIndex],
    ]),
  ),
  settings: {
    "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    "graph.metrics": ["count"],
  },
});

const STATES = [
  "AK",
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
];

// Texas has the most orders, so the y-axis goes up to 500 only with it
const COUNT_BY_YEAR_AND_STATE = createSeries({
  cols: [CREATED_AT_YEAR, createCategoryColumn("STATE", "User → State"), COUNT],
  rows: YEARS.flatMap((year, yearIndex) =>
    STATES.map((state, stateIndex) => [
      year,
      state,
      state === "TX" ? 100 * (yearIndex + 1) - 20 : 50 * yearIndex + stateIndex,
    ]),
  ),
  settings: {
    "graph.dimensions": ["CREATED_AT", "STATE"],
    "graph.metrics": ["count"],
  },
});

const SUM_OF_TOTAL = createMetricColumn("sum", "Sum of Total");
// The sum of a column keeps its semantic type, and two metrics with
// different semantic types go on two y-axes
const SUM_OF_QUANTITY = {
  ...createMetricColumn("sum_2", "Sum of Quantity", "type/BigInteger"),
  semantic_type: "type/Quantity",
};
const TOTALS = [42156.87, 205256.02, 351986.79, 403839.27, 507382.06];
const QUANTITIES = [3236, 14351, 22185, 25917, 28763];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A trend through the first two values, as the backend computes it by day */
const insight = (column: DatasetColumn, values: number[]) => {
  const firstDay = Date.parse(YEARS[0]) / MS_PER_DAY;
  const slope =
    (values[1] - values[0]) /
    ((Date.parse(YEARS[1]) - Date.parse(YEARS[0])) / MS_PER_DAY);
  return createMockInsight({
    col: column.name,
    unit: "year",
    "best-fit": ["+", values[0] - slope * firstDay, ["*", slope, "x"]],
  });
};

const SUMS_BY_YEAR_ON_SPLIT_AXES = createSeries({
  display: "combo",
  cols: [CREATED_AT_YEAR, SUM_OF_TOTAL, SUM_OF_QUANTITY],
  rows: YEARS.map((year, index) => [year, TOTALS[index], QUANTITIES[index]]),
  settings: { "graph.show_trendline": true },
});
SUMS_BY_YEAR_ON_SPLIT_AXES.data.insights = [
  insight(SUM_OF_TOTAL, TOTALS),
  insight(SUM_OF_QUANTITY, QUANTITIES),
];

// Doohickey has at most 42 distinct products, the others up to 54
const PRODUCTS_BY_CATEGORY: Record<Category, number[]> = {
  Doohickey: [30, 35, 38, 40, 42],
  Gadget: [40, 45, 48, 50, 54],
  Gizmo: [35, 40, 44, 47, 51],
  Widget: [38, 43, 46, 49, 53],
};

const COUNT_AND_PRODUCTS_BY_CATEGORY = createSeries({
  display: "scatter",
  cols: [
    CREATED_AT_YEAR,
    CATEGORY,
    COUNT,
    createMetricColumn(
      "count_2",
      "Distinct values of Product → ID",
      "type/BigInteger",
    ),
  ],
  rows: YEARS.flatMap((year, yearIndex) =>
    CATEGORIES.map((category) => [
      year,
      category,
      COUNTS_BY_CATEGORY[category][yearIndex],
      PRODUCTS_BY_CATEGORY[category][yearIndex],
    ]),
  ),
  settings: {
    "graph.dimensions": ["count", "CATEGORY"],
    "graph.metrics": ["count_2"],
  },
});

function getLegendItem(name: string) {
  return checkNotNull(
    screen
      .getAllByTestId("legend-item")
      .find((item) => within(item).queryByText(name) != null),
  );
}

async function hideSeries(name: string) {
  await userEvent.click(
    within(getLegendItem(name)).getByRole("button", { name: "Hide series" }),
  );
}

async function showSeries(name: string) {
  await userEvent.click(
    within(getLegendItem(name)).getByRole("button", { name: "Show series" }),
  );
}

function countBarsByCategory(chart: HTMLElement) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      countChartElements(chart, {
        type: "rect",
        color: CATEGORY_COLORS[category],
      }),
    ]),
  );
}

async function expectBarsByCategory(
  chart: HTMLElement,
  expected: Record<Category, number>,
) {
  await waitFor(() => expect(countBarsByCategory(chart)).toEqual(expected));
}

function getTrendLines(chart: HTMLElement) {
  return chart.querySelectorAll(
    `path[stroke-width='${TREND_LINE_WIDTH}'][stroke-linejoin='bevel']`,
  );
}

describe("CartesianChart legend", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hides and shows the series of a bar chart, but keeps one series visible", async () => {
    const chart = await setupChart({
      rawSeries: [COUNT_BY_YEAR_AND_CATEGORY],
      canToggleSeriesVisibility: true,
    });

    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 5,
      Gizmo: 5,
      Widget: 5,
    });
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(["Count", "Created At: year", "1,800", "0"]),
    );

    await hoverChartElement(chart, {
      type: "rect",
      color: "#88BF4D",
      index: 1,
    });
    await expectTooltip({
      header: "2026",
      rows: [
        "#88BF4D | Doohickey | 600 | +238.98%",
        "#F9D45C | Gadget | 700 | +251.76%",
        "#A989C5 | Gizmo | 650 | +311.39%",
        "#F2A86F | Widget | 710 | +238.1%",
      ],
    });

    await hideSeries("Gadget");
    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 0,
      Gizmo: 5,
      Widget: 5,
    });

    await hideSeries("Gizmo");
    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 0,
      Gizmo: 0,
      Widget: 5,
    });

    await hoverChartElement(chart, {
      type: "rect",
      color: "#88BF4D",
      index: 1,
    });
    await expectTooltip({
      header: "2026",
      rows: [
        "#88BF4D | Doohickey | 600 | +238.98%",
        "#F2A86F | Widget | 710 | +238.1%",
      ],
    });

    await hideSeries("Widget");
    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 0,
      Gizmo: 0,
      Widget: 0,
    });

    // the last visible series stays
    await hideSeries("Doohickey");
    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 0,
      Gizmo: 0,
      Widget: 0,
    });
    // the y-axis fits the visible series
    await waitFor(() => expect(getChartTexts(chart)).not.toContain("1,800"));
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(["Count", "Created At: year", "1,500", "0"]),
    );

    await showSeries("Gadget");
    await expectBarsByCategory(chart, {
      Doohickey: 5,
      Gadget: 5,
      Gizmo: 0,
      Widget: 0,
    });
    await waitFor(() => expect(getChartTexts(chart)).toContain("1,800"));
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(["Count", "Created At: year", "0"]),
    );
  });
  it("hides a series from the '+ N more' popover of a line chart", async () => {
    const chart = await setupChart({
      rawSeries: [COUNT_BY_YEAR_AND_STATE],
      canToggleSeriesVisibility: true,
    });
    expect(getChartTexts(chart)).toContain("500");

    await userEvent.click(screen.getByText(/^\+ \d+ more$/));
    const popover = await screen.findByRole("dialog");
    const texasItem = checkNotNull(
      within(popover)
        .getAllByTestId("legend-item")
        .find((item) => within(item).queryByText("TX") != null),
    );
    await userEvent.click(
      within(texasItem).getByRole("button", { name: "Hide series" }),
    );

    await waitFor(() => expect(getChartTexts(chart)).not.toContain("500"));
  });

  it("hides the y-axis and trend line of a hidden series on split axes", async () => {
    const chart = await setupChart({
      rawSeries: [SUMS_BY_YEAR_ON_SPLIT_AXES],
      canToggleSeriesVisibility: true,
    });
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining([
        "Sum of Total",
        "600,000",
        "Sum of Quantity",
        "30,000",
      ]),
    );
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(2));

    await hideSeries("Sum of Total");
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(1));
    expect(getChartTexts(chart)).not.toContain("Sum of Total");
    expect(getChartTexts(chart)).not.toContain("600,000");
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(["Sum of Quantity", "30,000"]),
    );

    await showSeries("Sum of Total");
    await hideSeries("Sum of Quantity");
    await waitFor(() =>
      expect(getChartTexts(chart)).not.toContain("Sum of Quantity"),
    );
    expect(getTrendLines(chart)).toHaveLength(1);
    expect(getChartTexts(chart)).not.toContain("30,000");
    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(["Sum of Total", "600,000"]),
    );
  });

  it("hides the bubbles of a scatter chart's series and fits the y-axis to the rest", async () => {
    const chart = await setupChart({
      rawSeries: [COUNT_AND_PRODUCTS_BY_CATEGORY],
      canToggleSeriesVisibility: true,
    });
    const countBubbles = () =>
      Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          countChartElements(chart, {
            type: "path",
            color: CATEGORY_COLORS[category],
          }),
        ]),
      );
    await waitFor(() =>
      expect(countBubbles()).toEqual({
        Doohickey: 5,
        Gadget: 5,
        Gizmo: 5,
        Widget: 5,
      }),
    );
    // the y-axis goes up to the most distinct products of any category
    expect(getChartTexts(chart)).toContain("55");
    expect(getChartTexts(chart)).not.toContain("42");

    await hideSeries("Gadget");
    await hideSeries("Gizmo");
    await hideSeries("Widget");

    await waitFor(() =>
      expect(countBubbles()).toEqual({
        Doohickey: 5,
        Gadget: 0,
        Gizmo: 0,
        Widget: 0,
      }),
    );
    await waitFor(() => expect(getChartTexts(chart)).toContain("42"));
    expect(getChartTexts(chart)).not.toContain("55");
  });
});
