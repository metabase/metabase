import {
  getChartElementRects,
  getChartTextElements,
  getChartTextRects,
  getChartTexts,
  getEChartsTooltip,
  getEChartsTooltipHeader,
  getPathsWithFill,
  getTooltipRows,
  getValueLabels,
  hoverChartElement,
  isGoalMarkerHitArea,
  mockRealisticTextWidth,
  unhoverChart,
  withFill,
} from "__support__/echarts-dom";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  resetMockExplicitSize,
  setMockExplicitSize,
} from "metabase/common/components/ExplicitSize/tests/mock-size";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  Card,
  DatasetColumn,
  RowValue,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  PEOPLE,
  PRODUCTS,
  createOrdersCreatedAtDatasetColumn,
  createOrdersDiscountDatasetColumn,
  createPeopleStateDatasetColumn,
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["bar", "row", "combo"]));

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 600;

function createNativeColumn(name: string, baseType: string): DatasetColumn {
  return createMockColumn({
    name,
    display_name: name,
    source: "native",
    base_type: baseType,
    effective_type: baseType,
    field_ref: ["field", name, { "base-type": baseType }],
  });
}

function createAggregationColumn(
  name: string,
  displayName: string,
  index: number,
  baseType = "type/Float",
): DatasetColumn {
  return createMockColumn({
    name,
    display_name: displayName,
    source: "aggregation",
    base_type: baseType,
    effective_type: baseType,
    field_ref: ["aggregation", index],
  });
}

const COUNT_COLUMN = createAggregationColumn(
  "count",
  "Count",
  0,
  "type/BigInteger",
);

function createCreatedAtColumn(unit: "month" | "year"): DatasetColumn {
  return createOrdersCreatedAtDatasetColumn({
    source: "breakout",
    unit,
    display_name: unit === "month" ? "Created At: Month" : "Created At: Year",
    field_ref: [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": unit },
    ],
  });
}

const PRODUCT_CATEGORY_COLUMN = createProductsCategoryDatasetColumn({
  source: "breakout",
  fk_field_id: ORDERS.PRODUCT_ID,
  display_name: "Product → Category",
  field_ref: [
    "field",
    PRODUCTS.CATEGORY,
    { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
  ],
});

// the backend tells an implicitly joined column by its fk_field_id
const USER_SOURCE_COLUMN = createMockColumn({
  id: PEOPLE.SOURCE,
  fk_field_id: ORDERS.USER_ID,
  name: "SOURCE",
  display_name: "User → Source",
  source: "breakout",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Source",
  field_ref: [
    "field",
    "SOURCE",
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ],
});

/** The first day of each month of a year, as the backend sends it */
function getMonths(year: number, count = 12) {
  return Array.from(
    { length: count },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}-01T00:00:00Z`,
  );
}

interface CreateCardOpts {
  id?: number;
  name?: string;
  display?: VisualizationDisplay;
  settings?: VisualizationSettings;
}

function createCard({
  id = 1,
  name = "Question",
  display = "bar",
  settings = {},
}: CreateCardOpts): Card {
  return createMockCard({
    id,
    name,
    display,
    visualization_settings: settings,
  });
}

interface SeriesOpts extends CreateCardOpts {
  cols: DatasetColumn[];
  rows: RowValue[][];
}

interface SetupOpts extends SeriesOpts {
  width?: number;
  height?: number;
  isDashboard?: boolean;
  extraSeries?: SeriesOpts[];
}

function renderSeries({
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
  isDashboard = false,
  extraSeries = [],
  ...seriesOpts
}: SetupOpts) {
  mockGetBoundingClientRect({ width, height });
  setMockExplicitSize({ width, height });
  const rawSeries = [seriesOpts, ...extraSeries].map(
    ({ cols, rows, ...cardOpts }) => ({
      card: createCard(cardOpts),
      data: createMockDatasetData({ cols, rows }),
    }),
  );
  renderWithProviders(
    <Visualization rawSeries={rawSeries} isDashboard={isDashboard} />,
  );
}

async function setup(opts: SetupOpts) {
  renderSeries(opts);
  const chart = await screen.findByTestId("chart-container");
  await waitFor(() => expect(chart.querySelector("path")).not.toBeNull());
  return { chart };
}

async function hoverAndGetTooltip(
  chart: HTMLElement,
  fill: string,
  index: number,
  expectedHeader?: string,
) {
  hoverChartElement(chart, withFill(fill), index);
  if (expectedHeader != null) {
    await waitFor(() =>
      expect(getEChartsTooltipHeader()).toHaveTextContent(
        new RegExp(`^${expectedHeader}$`),
      ),
    );
  } else {
    await waitFor(() => expect(getEChartsTooltip()).toBeInTheDocument());
  }
  return getEChartsTooltip();
}

describe("bar, row and combo chart rendering", () => {
  let restoreTextWidth: () => void;

  beforeAll(() => {
    restoreTextWidth = mockRealisticTextWidth();
  });

  afterAll(() => {
    restoreTextWidth();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetMockExplicitSize();
  });

  describe("with numeric dimension", () => {
    const COLS = [
      createNativeColumn("a", "type/Integer"),
      createNativeColumn("b", "type/Integer"),
    ];
    const ROWS = [
      [null, 10],
      [5, 2],
      [0, 1],
    ];

    it("should not show a bar for null values (metabase#12138)", async () => {
      const { chart } = await setup({
        cols: COLS,
        rows: ROWS,
        settings: { "graph.dimensions": ["a"], "graph.metrics": ["b"] },
      });

      expect(getPathsWithFill(chart, "#A989C5")).toHaveLength(2);
      expect(getChartTexts(chart)).not.toContain("(empty)");
      // the null row's value does not stretch the y-axis
      expect(getChartTexts(chart)).not.toContain("10");
    });

    it("should show an (empty) bar for null values when X axis is ordinal (metabase#12138)", async () => {
      const { chart } = await setup({
        cols: COLS,
        rows: ROWS,
        settings: {
          "graph.dimensions": ["a"],
          "graph.metrics": ["b"],
          "graph.x_axis.scale": "ordinal",
        },
      });

      expect(getChartTexts(chart)).toContain("(empty)");
      expect(getPathsWithFill(chart, "#A989C5")).toHaveLength(3);
    });

    it("should not freeze when opening a timeseries chart with sparse data and without the X-axis (metabase#18776)", async () => {
      const { chart } = await setup({
        cols: [
          createNativeColumn("id", "type/Integer"),
          createNativeColumn("rate", "type/Integer"),
        ],
        rows: [
          [101002, 1],
          [103017, 2],
          [210002, 3],
        ],
        settings: {
          "graph.dimensions": ["id"],
          "graph.metrics": ["rate"],
          "graph.x_axis.axis_enabled": false,
        },
      });

      expect(getPathsWithFill(chart, "#509EE3")).toHaveLength(3);
    });
  });

  it("should filter out null values of a binned dimension (metabase#16049)", async () => {
    const { chart } = await setup({
      display: "bar",
      cols: [
        createOrdersDiscountDatasetColumn({
          source: "breakout",
          display_name: "Discount: 10 bins",
          binning_info: {
            binning_strategy: "default",
            bin_width: 10,
            min_value: 0,
            max_value: 50,
            num_bins: 10,
          },
          field_ref: [
            "field",
            ORDERS.DISCOUNT,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        }),
        COUNT_COLUMN,
      ],
      rows: [
        [null, 16845],
        [0, 1715],
        [10, 140],
        [20, 38],
        [30, 15],
        [40, 7],
      ],
      settings: {},
    });

    // there are six bars when null isn't filtered
    expect(getPathsWithFill(chart, "#509EE3")).toHaveLength(5);
    const texts = getChartTexts(chart);
    // the y-axis fits the data
    expect(texts).toContain("1,800");
    // it stretches much higher when it includes the nulls
    expect(texts).not.toContain("16,000");
  });

  it("should display correct data values with very low and high values", async () => {
    const { chart } = await setup({
      cols: [
        createNativeColumn("X_AXIS_1", "type/Text"),
        createNativeColumn("X_AXIS_2", "type/Text"),
        createNativeColumn("Y_AXIS", "type/Integer"),
      ],
      rows: [
        ["2027-01-01", "A", 20000000],
        ["2027-01-02", "A", 19],
        ["2027-01-03", "A", 20000000],
      ],
      settings: {
        "graph.show_values": true,
        "graph.dimensions": ["X_AXIS_1", "X_AXIS_2"],
        "graph.metrics": ["Y_AXIS"],
      },
    });

    const labels = getValueLabels(chart);
    expect(labels).toContain("19");
    expect(labels).toContain("20.0M");
  });

  describe("with split y-axis (metabase#12939)", () => {
    const AVG_COLUMN = createAggregationColumn("avg", "Average of Total", 0);
    const MIN_COLUMN = createAggregationColumn("min", "Min of Total", 1);
    // average and minimum order totals by month: the few orders of the first
    // months spread both series, so they overlap enough for one axis
    const AVG_AND_MIN_ROWS = getMonths(2026).map((month, index) => [
      month,
      80 - index * 3,
      50 - index * 3.5,
    ]);

    it("should split the y-axis when column settings differ", async () => {
      const { chart } = await setup({
        cols: [createCreatedAtColumn("month"), AVG_COLUMN, MIN_COLUMN],
        rows: AVG_AND_MIN_ROWS,
        settings: {
          column_settings: {
            '["name","avg"]': { number_style: "decimal" },
            '["name","min"]': { number_style: "percent" },
          },
        },
      });

      const texts = getChartTexts(chart);
      expect(texts).toContain("Average of Total");
      expect(texts).toContain("Min of Total");
    });

    it("should not split the y-axis when semantic_type, column settings are same and values are not far", async () => {
      const { chart } = await setup({
        cols: [createCreatedAtColumn("month"), AVG_COLUMN, MIN_COLUMN],
        rows: AVG_AND_MIN_ROWS,
      });

      const texts = getChartTexts(chart);
      expect(texts).toContain("Created At: Month");
      expect(texts).not.toContain("Average of Total");
      expect(texts).not.toContain("Min of Total");
    });

    it("should split the y-axis on native queries with two numeric columns", async () => {
      const { chart } = await setup({
        cols: [
          createNativeColumn("x", "type/Text"),
          createNativeColumn("m1", "type/BigInteger"),
          createNativeColumn("m2", "type/Float"),
        ],
        rows: [
          ["Doohickey", 3976, 5.29],
          ["Gadget", 4939, 5.42],
          ["Gizmo", 4784, 5.32],
          ["Widget", 5061, 5.23],
        ],
        settings: { "graph.dimensions": ["x"], "graph.metrics": ["m1", "m2"] },
      });

      const texts = getChartTexts(chart);
      expect(texts).toContain("m1");
      expect(texts).toContain("m2");
    });

    it("when two axis should show only one related to the hovered series (metabase#49874, metabase#48847)", async () => {
      const { chart } = await setup({
        cols: [
          createCreatedAtColumn("month"),
          createAggregationColumn(
            "sum",
            "Sum of Quantity",
            0,
            "type/BigInteger",
          ),
          createAggregationColumn("sum_2", "Sum of Total", 1),
        ],
        rows: getMonths(2026).map((month, index) => [
          month,
          1800 + index * 40,
          40000 + index * 900,
        ]),
      });
      // a hidden grid line stays in the page with no opacity
      const getVisibleGridLines = () =>
        chart.querySelectorAll(
          "path[stroke='var(--mb-color-chart-axis)'][fill='none']:not([stroke-linecap='round']):not([stroke-opacity='0'])",
        );

      expect(getChartTexts(chart)).toEqual(
        expect.arrayContaining(["Sum of Quantity", "Sum of Total"]),
      );
      expect(getVisibleGridLines().length).toBeGreaterThan(0);

      // a bar other than the first, so a fixed first bar cannot pass
      hoverChartElement(chart, withFill("#88BF4D"), 3);
      await waitFor(() =>
        expect(getChartTexts(chart)).not.toContain("Sum of Total"),
      );
      expect(getChartTexts(chart)).toContain("Sum of Quantity");
      expect(getVisibleGridLines().length).toBeGreaterThan(0);

      hoverChartElement(chart, withFill("#98D9D9"), 3);
      await waitFor(() =>
        expect(getChartTexts(chart)).not.toContain("Sum of Quantity"),
      );
      expect(getChartTexts(chart)).toContain("Sum of Total");
      expect(getVisibleGridLines().length).toBeGreaterThan(0);
    });
  });

  describe("with more than 10 series (#33725, #34618)", () => {
    const SEPTEMBER = "2026-09-01T00:00:00Z";
    const METRICS: [string, string, number][] = [
      ["avg", "Average of Tax", 3.84],
      ["sum", "Sum of Tax", 1251.38],
      ["min", "Min of Tax", 0],
      ["max", "Max of Tax", 11.12],
      ["avg_2", "Average of Subtotal", 77.62],
      ["sum_2", "Sum of Subtotal", 19886.4],
      ["min_2", "Min of Subtotal", 15.69],
      ["max_2", "Max of Subtotal", 148.23],
      ["avg_3", "Average of Total", 81.1],
      ["sum_3", "Sum of Total", 20963.21],
      ["min_3", "Min of Total", 15.69],
      ["max_3", "Max of Total", 159.35],
    ];

    it("should split the y-axis of a 12-metric chart with values on data points", async () => {
      const { chart } = await setup({
        isDashboard: true,
        width: 600,
        height: 400,
        name: "Should split",
        cols: [
          createCreatedAtColumn("month"),
          ...METRICS.map(([name, displayName], index) =>
            createAggregationColumn(name, displayName, index),
          ),
        ],
        rows: [[SEPTEMBER, ...METRICS.map(([, , value]) => value)]],
        settings: { "graph.show_values": true },
      });

      // the top tick on both sides proves there are two y-axes
      expect(
        getChartTexts(chart).filter((text) => text === "21.0k"),
      ).toHaveLength(2);
    });

    it("should show the names of the questions of a multi-series chart", async () => {
      const cols = (name: string, displayName: string) => [
        createCreatedAtColumn("month"),
        createAggregationColumn(name, displayName, 0),
      ];
      const { chart } = await setup({
        isDashboard: true,
        width: 600,
        height: 400,
        id: 1,
        name: "Average Total by Month",
        display: "line",
        cols: cols("avg", "Average of Total"),
        rows: getMonths(2026).map((month, index) => [month, 55 + index]),
        extraSeries: [
          {
            id: 2,
            name: "Sum Total by Month",
            display: "line",
            cols: cols("sum", "Sum of Total"),
            rows: getMonths(2026).map((month, index) => [
              month,
              40000 + index * 900,
            ]),
          },
        ],
      });

      const texts = getChartTexts(chart);
      expect(texts).toContain("Average Total by Month");
      expect(texts).toContain("Sum Total by Month");
    });

    it("should not split the y-axis of a breakout with more than 10 series (#34618)", async () => {
      const STATE_COUNTS: [string, number][] = [
        ["AK", 6],
        ["AL", 8],
        ["AR", 7],
        ["AZ", 11],
        ["CA", 9],
        ["CO", 13],
        ["CT", 5],
        ["FL", 10],
        ["GA", 4],
        ["IA", 19],
      ];
      const { chart } = await setup({
        isDashboard: true,
        width: 1000,
        height: 400,
        name: "Should not Split",
        cols: [
          createCreatedAtColumn("month"),
          createPeopleStateDatasetColumn({
            source: "breakout",
            display_name: "User → State",
          }),
          COUNT_COLUMN,
        ],
        rows: STATE_COUNTS.map(([state, count]) => [SEPTEMBER, state, count]),
        settings: {
          "graph.dimensions": ["CREATED_AT", "STATE"],
          "graph.metrics": ["count"],
          "graph.show_values": true,
        },
      });

      expect(getValueLabels(chart)).toEqual(
        expect.arrayContaining(["6", "13", "19"]),
      );
      expect(getChartTexts(chart).filter((text) => text === "Count")).toEqual([
        "Count",
      ]);
    });
  });

  it("should correctly handle bar sizes and tool-tips for multiple y-axis metrics with column scaling (#43536)", async () => {
    const SUMS = [42156.868, 205256.02, 351986.79, 403839.27, 507382.06];
    const { chart } = await setup({
      cols: [
        createCreatedAtColumn("year"),
        createAggregationColumn("sum", "Sum of Total", 0),
        createAggregationColumn("sum_2", "Sum of Total", 1),
      ],
      rows: SUMS.map((sum, index) => [
        `${2025 + index}-01-01T00:00:00Z`,
        sum,
        sum,
      ]),
      settings: {
        column_settings: { '["name","sum"]': { scale: 0.5 } },
        "graph.show_values": true,
        "graph.stackable.stack_type": "stacked",
        series_settings: { sum_2: { axis: "left" }, sum: { axis: "left" } },
      },
    });

    const scaledBars = getChartElementRects(chart, withFill("#88BF4D"));
    const bars = getChartElementRects(chart, withFill("#98D9D9"));
    expect(scaledBars).toHaveLength(SUMS.length);
    scaledBars.forEach((scaledBar, index) => {
      // the first metric is scaled to half of the second one
      expect(scaledBar.height).toBeCloseTo(bars[index].height / 2, 0);
    });

    const firstYear = await hoverAndGetTooltip(chart, "#88BF4D", 0, "2025");
    expect(getTooltipRows(firstYear)).toEqual([
      { color: "#88BF4D", name: "Sum of Total", value: "21,078.43" },
      { color: "#98D9D9", name: "Sum of Total", value: "42,156.87" },
    ]);

    const secondYear = await hoverAndGetTooltip(chart, "#88BF4D", 1, "2026");
    expect(getTooltipRows(secondYear)).toEqual([
      {
        color: "#88BF4D",
        name: "Sum of Total",
        value: "102,628.01",
        secondaryValue: "+386.89%",
      },
      {
        color: "#98D9D9",
        name: "Sum of Total",
        value: "205,256.02",
        secondaryValue: "+386.89%",
      },
    ]);
  });

  describe("stacked tooltips with negative values (#39012, #47596)", () => {
    const COLS = [
      createNativeColumn("CREATED_AT", "type/Date"),
      createNativeColumn("CATEGORY", "type/Text"),
      createNativeColumn("V", "type/Integer"),
    ];
    const SETTINGS: VisualizationSettings = {
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["V"],
      "stackable.stack_type": "stacked",
    };

    it("should show the totals of a stacked bar with a negative total (#39012)", async () => {
      const { chart } = await setup({
        cols: COLS,
        rows: [
          ["2024-05-19", "blue", 2],
          ["2024-05-19", "yellow", 8],
          ["2024-05-20", "blue", -16],
          ["2024-05-20", "yellow", 8],
          ["2024-05-21", "blue", -7],
          ["2024-05-21", "yellow", 5],
          ["2024-05-22", "blue", 2],
          ["2024-05-22", "yellow", -2],
          ["2024-05-23", "blue", 3],
          ["2024-05-23", "yellow", -2],
        ],
        settings: SETTINGS,
      });
      const BLUE = "#A989C5";
      const YELLOW = "#F9D45C";

      const expectedRows = [
        [
          { color: BLUE, name: "blue", value: "2", secondaryValue: "20.00 %" },
          {
            color: YELLOW,
            name: "yellow",
            value: "8",
            secondaryValue: "80.00 %",
          },
          { name: "Total", value: "10", secondaryValue: "100 %" },
        ],
        [
          {
            color: YELLOW,
            name: "yellow",
            value: "8",
            secondaryValue: "100 %",
          },
          { name: "Total positive", value: "8" },
          {
            color: BLUE,
            name: "blue",
            value: "-16",
            secondaryValue: "-100 %",
          },
          { name: "Total negative", value: "-16" },
          { name: "Total", value: "-8" },
        ],
        [
          {
            color: YELLOW,
            name: "yellow",
            value: "5",
            secondaryValue: "100 %",
          },
          { name: "Total positive", value: "5" },
          { color: BLUE, name: "blue", value: "-7", secondaryValue: "-100 %" },
          { name: "Total negative", value: "-7" },
          { name: "Total", value: "-2" },
        ],
        [
          { color: BLUE, name: "blue", value: "2", secondaryValue: "100 %" },
          { name: "Total positive", value: "2" },
          {
            color: YELLOW,
            name: "yellow",
            value: "-2",
            secondaryValue: "-100 %",
          },
          { name: "Total negative", value: "-2" },
          { name: "Total", value: "0" },
        ],
        [
          { color: BLUE, name: "blue", value: "3", secondaryValue: "100 %" },
          { name: "Total positive", value: "3" },
          {
            color: YELLOW,
            name: "yellow",
            value: "-2",
            secondaryValue: "-100 %",
          },
          { name: "Total negative", value: "-2" },
          { name: "Total", value: "1" },
        ],
      ];
      const headers = [
        "May 19, 2024",
        "May 20, 2024",
        "May 21, 2024",
        "May 22, 2024",
        "May 23, 2024",
      ];

      for (const [index, rows] of expectedRows.entries()) {
        const tooltip = await hoverAndGetTooltip(
          chart,
          BLUE,
          index,
          headers[index],
        );
        expect(getTooltipRows(tooltip)).toEqual(rows);
        unhoverChart(chart);
      }
    });

    it("should show multiple positive and multiple negative segments (#47596)", async () => {
      const { chart } = await setup({
        cols: COLS,
        rows: [
          ["2024-05-21", "cat1", 2],
          ["2024-05-21", "cat2", -1],
          ["2024-05-21", "cat3", 1],
          ["2024-05-21", "cat4", -1],
        ],
        settings: SETTINGS,
      });

      const tooltip = await hoverAndGetTooltip(chart, "#F9D45C", 0);
      expect(getTooltipRows(tooltip)).toEqual([
        {
          color: "#EF8C8C",
          name: "cat1",
          value: "2",
          secondaryValue: "66.67 %",
        },
        {
          color: "#F2A86F",
          name: "cat3",
          value: "1",
          secondaryValue: "33.33 %",
        },
        { name: "Total positive", value: "3" },
        {
          color: "#98D9D9",
          name: "cat4",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        {
          color: "#F9D45C",
          name: "cat2",
          value: "-1",
          secondaryValue: "-50.00 %",
        },
        { name: "Total negative", value: "-2" },
        { name: "Total", value: "1" },
      ]);
    });
  });

  it("should format goal tooltip value as a percent when the Stacking option is 'Stack - 100%'", async () => {
    const SOURCES = ["Affiliate", "Facebook", "Google", "Organic", "Twitter"];
    const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
    const { chart } = await setup({
      cols: [USER_SOURCE_COLUMN, PRODUCT_CATEGORY_COLUMN, COUNT_COLUMN],
      rows: SOURCES.flatMap((source, sourceIndex) =>
        CATEGORIES.map((category, categoryIndex) => [
          source,
          category,
          700 + sourceIndex * 50 + categoryIndex * 30,
        ]),
      ),
      settings: {
        "graph.goal_value": 87.5,
        "graph.show_goal": true,
        "stackable.stack_type": "normalized",
      },
    });

    hoverChartElement(chart, isGoalMarkerHitArea);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Goal:")).toBeInTheDocument();
    expect(within(tooltip).getByText("87.5%")).toBeInTheDocument();
  });

  it("should display all axis labels for 12 months of data (metabase#60475)", async () => {
    const months = getMonths(2026);
    const { chart } = await setup({
      width: 1500,
      cols: [createCreatedAtColumn("month"), COUNT_COLUMN],
      rows: months.map((month, index) => [month, 500 + index * 20]),
      settings: { "graph.x_axis.axis_enabled": "compact" },
    });

    const monthLabels = getChartTexts(chart).filter((text) =>
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(text),
    );
    expect(monthLabels).toEqual([
      "Jan 2026",
      "Feb 2026",
      "Mar 2026",
      "Apr 2026",
      "May 2026",
      "Jun 2026",
      "Jul 2026",
      "Aug 2026",
      "Sep 2026",
      "Oct 2026",
      "Nov 2026",
      "Dec 2026",
    ]);
  });

  it("should rotate axis labels when they do not fit horizontally instead of hiding them (metabase#68048)", async () => {
    const LABELS = [
      "Alnyba",
      "Bvsieginlri",
      "Cflonta",
      "Dgamruh",
      "Eitstrugb",
      "Farnotcs",
      "Gkro",
    ];
    const AMOUNTS = [390000, 500000, 700000, 50000, 130000, 107000, 750000];
    const { chart } = await setup({
      width: 420,
      cols: [
        createNativeColumn("LABEL", "type/Text"),
        createNativeColumn("AMOUNT", "type/Integer"),
      ],
      rows: LABELS.map((label, index) => [label, AMOUNTS[index]]),
      settings: {
        "graph.dimensions": ["LABEL"],
        "graph.metrics": ["AMOUNT"],
      },
    });

    const labels = getChartTextElements(chart, LABELS);
    expect(labels.map((label) => label.textContent?.trim())).toEqual(LABELS);
    labels.forEach((label) => {
      expect(label).toHaveAttribute(
        "transform",
        expect.stringMatching(/matrix/),
      );
    });
  });

  it("should handle invalid x-axis scale (metabase#25156)", async () => {
    const YEARS = [2025, 2026, 2027, 2028];
    const { chart } = await setup({
      cols: [
        createMockColumn({
          name: "CREATED_AT",
          display_name: "Created At: Year",
          source: "breakout",
          base_type: "type/DateTime",
          effective_type: "type/DateTime",
          unit: "year",
          field_ref: [
            "field",
            "CREATED_AT",
            { "base-type": "type/DateTime", "temporal-unit": "year" },
          ],
        }),
        createMockColumn({
          name: "RATING",
          display_name: "Rating",
          source: "breakout",
          base_type: "type/Integer",
          effective_type: "type/Integer",
          semantic_type: "type/Score",
          field_ref: ["field", "RATING", { "base-type": "type/Integer" }],
        }),
        COUNT_COLUMN,
      ],
      rows: YEARS.flatMap((year) =>
        [1, 2, 3, 4, 5].map((rating) => [
          `${year}-01-01T00:00:00Z`,
          rating,
          20 + rating * 10,
        ]),
      ),
      settings: {
        "graph.dimensions": ["CREATED_AT", "RATING"],
        "graph.metrics": ["count"],
        "graph.x_axis.scale": "linear",
      },
    });

    expect(getChartTexts(chart)).toEqual(
      expect.arrayContaining(YEARS.map(String)),
    );
  });

  it("should reflect/apply sorting to the x-axis (metabase#27279)", async () => {
    const { chart } = await setup({
      cols: [
        createNativeColumn("K", "type/Text"),
        createNativeColumn("O", "type/Integer"),
        createAggregationColumn("sum", "Sum of V", 0, "type/BigInteger"),
      ],
      // the rows come sorted by O, which is not the alphabetical order of K
      rows: [
        ["F2021", -3, 1],
        ["V2021", -2, 2],
        ["S2022", -1, 3],
        ["F2022", 0, 4],
      ],
      settings: { "graph.dimensions": ["K", "O"], "graph.metrics": ["sum"] },
    });

    expect(
      screen.getAllByTestId("legend-item").map((item) => item.textContent),
    ).toEqual(["-3", "-2", "-1", "0"]);
    expect(
      getChartTextElements(chart, ["F2021", "V2021", "S2022", "F2022"]).map(
        (text) => text.textContent?.trim(),
      ),
    ).toEqual(["F2021", "V2021", "S2022", "F2022"]);

    const first = await hoverAndGetTooltip(chart, "#98D9D9", 0, "F2021");
    expect(getTooltipRows(first)).toEqual([
      { color: "#98D9D9", name: "-3", value: "1" },
      { color: "#F2A86F", name: "-2", value: "(empty)" },
      { color: "#F9D45C", name: "-1", value: "(empty)" },
      { color: "#509EE3", name: "0", value: "(empty)" },
    ]);

    const last = await hoverAndGetTooltip(chart, "#509EE3", 0, "F2022");
    expect(getTooltipRows(last)).toEqual([
      { color: "#98D9D9", name: "-3", value: "(empty)" },
      { color: "#F2A86F", name: "-2", value: "(empty)" },
      { color: "#F9D45C", name: "-1", value: "(empty)" },
      { color: "#509EE3", name: "0", value: "4" },
    ]);
  });

  it("should not show an extra value on bar charts when there is only value on the x axis (metabase#63671)", async () => {
    const { chart } = await setup({
      cols: [createCreatedAtColumn("year"), COUNT_COLUMN],
      rows: [["2028-01-01T00:00:00Z", 1]],
    });

    const texts = getChartTexts(chart);
    expect(texts).toContain("2028");
    expect(texts).not.toContain("2027");
    expect(texts).not.toContain("2029");
  });

  it("should not have y-axis labels colliding with very low percentages (metabase#55853)", async () => {
    const { chart } = await setup({
      cols: [
        createNativeColumn("category", "type/Text"),
        createNativeColumn("value", "type/Decimal"),
      ],
      rows: [
        ["Category A", 0.0001],
        ["Category B", 0.0002],
        ["Category C", 0.00015],
        ["Category D", 0.00025],
      ],
      settings: {
        "graph.dimensions": ["category"],
        "graph.metrics": ["value"],
        column_settings: { '["name","value"]': { number_style: "percent" } },
      },
    });

    expect(getPathsWithFill(chart, "#88BF4D")).toHaveLength(4);
    const percentTexts = getChartTexts(chart).filter((text) =>
      text.includes("%"),
    );
    expect(percentTexts.length).toBeGreaterThan(0);

    const [axisTitle] = getChartTextRects(chart, (text) => text === "value");
    const tickLabels = getChartTextRects(chart, (text) => text.includes("%"));
    expect(axisTitle).toBeDefined();
    expect(tickLabels.length).toBeGreaterThan(0);
    // the layout keeps the axis title's margin (24px for a chart this size)
    // between the title and the widest tick label
    const AXIS_TITLE_MARGIN = 24;
    const titleRight = axisTitle.x + axisTitle.width;
    tickLabels.forEach((label) => {
      expect(label.x - titleRight).toBeGreaterThanOrEqual(AXIS_TITLE_MARGIN);
    });

    // a bar other than the first, so a fixed first bar cannot pass
    const tooltip = await hoverAndGetTooltip(chart, "#88BF4D", 1, "Category B");
    expect(getTooltipRows(tooltip)).toEqual([
      { color: "#88BF4D", name: "value", value: "0.02%" },
    ]);
    unhoverChart(chart);
    const firstTooltip = await hoverAndGetTooltip(
      chart,
      "#88BF4D",
      0,
      "Category A",
    );
    expect(getTooltipRows(firstTooltip)).toEqual([
      { color: "#88BF4D", name: "value", value: "0.01%" },
    ]);
  });

  describe("row chart", () => {
    it("should handle very long product titles in row chart", async () => {
      const TITLES = [
        "Rustic Paper Wallet",
        "Small Marble Shoes",
        "Synergistic Granite Chair",
        "Enormous Aluminum Shirt",
        "Enormous Marble Wallet",
        "Fantastic Wool Shirt",
      ];
      const { chart } = await setup({
        display: "row",
        cols: [
          createMockColumn({
            name: "LongName",
            display_name: "LongName",
            source: "breakout",
            base_type: "type/Text",
            effective_type: "type/Text",
            field_ref: ["expression", "LongName", { "base-type": "type/Text" }],
          }),
          COUNT_COLUMN,
        ],
        // the title concatenated ten times
        rows: TITLES.map((title, index) => [title.repeat(10), index + 1]),
      });

      const bars = getChartElementRects(chart, withFill("#509EE3"));
      const labels = getChartTextRects(chart, () => true);
      const widest = (rects: { width: number }[]) =>
        Math.max(...rects.map((rect) => rect.width));
      expect(bars).toHaveLength(TITLES.length);
      // the labels don't crowd out the bars
      expect(widest(bars)).toBeGreaterThan(CHART_WIDTH / 3);
      // long labels are truncated to at most half the chart, not hidden
      expect(widest(labels)).toBeGreaterThan(CHART_WIDTH / 3);
      expect(widest(labels)).toBeLessThanOrEqual(CHART_WIDTH / 2);
    });

    it("should display an error message when there are more series than the chart supports", async () => {
      const SUPPORTED_SERIES_COUNT = 100;
      renderSeries({
        display: "row",
        cols: [
          createCreatedAtColumn("year"),
          createMockColumn({
            name: "TITLE",
            display_name: "Title",
            source: "breakout",
            base_type: "type/Text",
            effective_type: "type/Text",
            field_ref: ["field", PRODUCTS.TITLE, { "base-type": "type/Text" }],
          }),
          COUNT_COLUMN,
        ],
        rows: Array.from({ length: SUPPORTED_SERIES_COUNT + 1 }, (_, index) => [
          `${2025 + (index % 4)}-01-01T00:00:00Z`,
          `Product ${index + 1}`,
          1,
        ]),
        settings: {
          "graph.dimensions": ["CREATED_AT", "TITLE"],
          "graph.metrics": ["count"],
        },
      });

      expect(
        await screen.findByText(
          "This chart type doesn't support more than 100 series of data.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("chart-container")).not.toBeInTheDocument();
    });

    it("should draw 100 series, the most the chart supports", async () => {
      renderSeries({
        display: "row",
        cols: [
          createCreatedAtColumn("year"),
          createMockColumn({
            name: "TITLE",
            display_name: "Title",
            source: "breakout",
            base_type: "type/Text",
            effective_type: "type/Text",
            field_ref: ["field", PRODUCTS.TITLE, { "base-type": "type/Text" }],
          }),
          COUNT_COLUMN,
        ],
        rows: Array.from({ length: 100 }, (_, index) => [
          `${2025 + (index % 4)}-01-01T00:00:00Z`,
          `Product ${index + 1}`,
          1,
        ]),
        settings: {
          "graph.dimensions": ["CREATED_AT", "TITLE"],
          "graph.metrics": ["count"],
        },
      });

      expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
      expect(
        screen.queryByText(
          "This chart type doesn't support more than 100 series of data.",
        ),
      ).not.toBeInTheDocument();
    });

    it("should show the goal in a tooltip when hovering the goal marker", async () => {
      const { chart } = await setup({
        display: "row",
        cols: [
          createProductsCategoryDatasetColumn({ source: "breakout" }),
          COUNT_COLUMN,
        ],
        rows: [
          ["Doohickey", 42],
          ["Gadget", 53],
          ["Gizmo", 51],
          ["Widget", 54],
        ],
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": 40,
          "graph.goal_label": "Target",
        },
      });

      hoverChartElement(chart, isGoalMarkerHitArea);
      const tooltip = await screen.findByRole("tooltip");
      expect(within(tooltip).getByText("Target:")).toBeInTheDocument();
      expect(within(tooltip).getByText("40")).toBeInTheDocument();
    });
  });

  describe("combo chart", () => {
    it("should render values on data points", async () => {
      const { chart } = await setup({
        display: "combo",
        cols: [
          createProductsCreatedAtDatasetColumn({
            source: "breakout",
            unit: "month",
            display_name: "Created At: Month",
            field_ref: [
              "field",
              PRODUCTS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          }),
          COUNT_COLUMN,
          createAggregationColumn("sum", "Sum of Price", 1),
        ],
        rows: [
          ["2025-07-01T00:00:00Z", 6, 287.11],
          ["2025-08-01T00:00:00Z", 8, 408.66],
          ["2025-09-01T00:00:00Z", 5, 251.3],
        ],
        settings: { "graph.show_values": true },
      });

      expect(getValueLabels(chart)).toContain("408.66");
    });
  });
});
