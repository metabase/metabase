import userEvent from "@testing-library/user-event";
import { getInstanceByDom } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";

import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  RowValue,
  TestStageWithSourceSpec,
  UnsavedCard,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToStart } from "./test-utils";

registerVisualizations();

const INCREASE_COLOR = "#88BF4D";
const TOTAL_COLOR = "#303D46";
const CUSTOM_INCREASE_COLOR = "#00FF00";
const GOAL_LINE_DASH = "2,2";

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
  baseType = "type/BigInteger",
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

function createDataset(cols: DatasetColumn[], rows: RowValue[][]): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
    row_count: rows.length,
  });
}

const EMPTY_DATASET = createDataset([], []);

interface NativeCardOpts {
  id: number;
  query: string;
  display?: VisualizationDisplay;
  visualizationSettings?: VisualizationSettings;
}

function createNativeCard({
  id,
  query,
  display = "table",
  visualizationSettings = {},
}: NativeCardOpts): Card {
  return createMockCard({
    id,
    name: `Native question ${id}`,
    display,
    query_type: "native",
    visualization_settings: visualizationSettings,
    dataset_query: Lib.toJsQuery(
      Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query }),
    ),
  });
}

function createStructuredQuery(stage: TestStageWithSourceSpec) {
  return Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
  );
}

function getRequestBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

/** Reads a nested value of a request body, or undefined when it is missing */
function getIn(value: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current != null && typeof current === "object" && key in current
        ? Reflect.get(current, key)
        : undefined,
    value,
  );
}

const COUNT_COLUMN = createAggregationColumn("count", "Count", 0);

const YEARS = ["2025", "2026", "2027", "2028", "2029"];
// add up to 18,760 orders
const COUNTS_BY_YEAR = [744, 2607, 3843, 5060, 6506];
const SUMS_BY_YEAR = [42156.87, 205256.02, 351986.79, 403839.27, 507382.06];
const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const COUNT_AND_SUM_BY_YEAR_STAGE: TestStageWithSourceSpec = {
  source: { type: "table", id: ORDERS_ID },
  aggregations: [
    { type: "operator", operator: "count", args: [] },
    {
      type: "operator",
      operator: "sum",
      args: [{ type: "column", name: "TOTAL" }],
    },
  ],
  breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
};

const COUNT_AND_SUM_BY_YEAR_DATASET = createDataset(
  [
    createCreatedAtColumn("year"),
    COUNT_COLUMN,
    createAggregationColumn("sum", "Sum of Total", 1, "type/Float"),
  ],
  YEARS.map((year, index) => [
    `${year}-01-01T00:00:00Z`,
    COUNTS_BY_YEAR[index],
    SUMS_BY_YEAR[index],
  ]),
);

const UNAGGREGATED_QUERY = `SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS "d", 1 AS "c" UNION ALL
SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS "d", 2 AS "c" UNION ALL
SELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS "d", 3 AS "c"`;

function getStage(body: unknown, path: (string | number)[]) {
  return getIn(body, ["stages", 0, ...path]);
}

function isCountQuery(body: unknown) {
  return (
    getStage(body, ["source-table"]) === ORDERS_ID &&
    getStage(body, ["aggregation", 0, 0]) === "count"
  );
}

function isCreatedAtBreakout(
  body: unknown,
  index: number,
  unit: "month" | "year",
) {
  return (
    getStage(body, ["breakout", index, 2]) === ORDERS.CREATED_AT &&
    getStage(body, ["breakout", index, 1, "temporal-unit"]) === unit
  );
}

function isCountByMonthQuery(body: unknown) {
  return (
    isCountQuery(body) &&
    getStage(body, ["aggregation", "length"]) === 1 &&
    isCreatedAtBreakout(body, 0, "month") &&
    getStage(body, ["breakout", "length"]) === 1
  );
}

function isCountAndSumByYearQuery(body: unknown) {
  return (
    isCountQuery(body) &&
    getStage(body, ["aggregation", 1, 0]) === "sum" &&
    getStage(body, ["aggregation", 1, 2, 2]) === ORDERS.TOTAL &&
    isCreatedAtBreakout(body, 0, "year") &&
    getStage(body, ["breakout", "length"]) === 1
  );
}

function isCountByYearAndCategoryQuery(body: unknown) {
  return (
    isCountQuery(body) &&
    isCreatedAtBreakout(body, 0, "year") &&
    getStage(body, ["breakout", 1, 2]) === PRODUCTS.CATEGORY &&
    getStage(body, ["breakout", 1, 1, "source-field"]) === ORDERS.PRODUCT_ID &&
    getStage(body, ["breakout", "length"]) === 2
  );
}

interface AdhocQuestionOpts {
  card: UnsavedCard;
  matches: (body: unknown) => boolean;
  dataset: Dataset;
}

/**
 * Opens an ad-hoc question. POST /api/dataset returns the rows only for a
 * query that `matches`, and no rows for any other query.
 */
async function setupAdhocQuestion({
  card,
  matches,
  dataset,
}: AdhocQuestionOpts) {
  const result = await setup({
    card,
    // keeps the display the card asks for, as a locked display in the URL does
    initialRoute: `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    waitForLoad: false,
  });
  // the question runs from a timer after the loader is gone
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) =>
      matches(getRequestBody(call)) ? dataset : EMPTY_DATASET,
  });
  await waitForLoaderToBeRemoved();
  await waitForQueryToStart();
  await waitFor(() =>
    expect(fetchMock.callHistory.calls("dataset-post")).toHaveLength(1),
  );
  await act(() => fetchMock.callHistory.flush(true));
  return result;
}

const getChart = () => screen.findByTestId("chart-container");
const getSettingsSidebar = () => screen.getByTestId("chartsettings-sidebar");

function getPathsWithFill(chart: HTMLElement, color: string) {
  return chart.querySelectorAll(`path[fill='${color}']`);
}

function getDataLabels(chart: HTMLElement) {
  return Array.from(
    chart.querySelectorAll("text[paint-order='stroke']"),
    (text) => text.textContent ?? "",
  );
}

async function openVisualizationSidebar() {
  await userEvent.click(
    within(screen.getByTestId("view-footer")).getByRole("button", {
      name: "Visualization",
    }),
  );
  return screen.findByTestId("chart-type-sidebar");
}

async function switchToWaterfall() {
  const sidebar = await openVisualizationSidebar();
  const toggle = within(sidebar).getByTestId("more-charts-toggle");
  if (toggle.closest("[aria-expanded='false']")) {
    await userEvent.click(toggle);
  }
  await userEvent.click(within(sidebar).getByTestId("Waterfall-button"));
  await userEvent.click(
    within(await screen.findByTestId("Waterfall-container")).getByLabelText(
      "gear icon",
    ),
  );
  return screen.findByTestId("chartsettings-sidebar");
}

async function openSettingsTab(name: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByRole("tab", { name }),
  );
}

async function pickField(index: number, name: string) {
  const pickers =
    within(getSettingsSidebar()).getAllByPlaceholderText("Select a field");
  await userEvent.click(pickers[index]);
  await userEvent.click(await screen.findByRole("option", { name }));
}

async function assertWaterfallRendering(xLabel: string, yLabel: string) {
  const chart = await getChart();
  await waitFor(() =>
    expect(within(chart).getByText("Total")).toBeInTheDocument(),
  );
  expect(getPathsWithFill(chart, INCREASE_COLOR).length).toBeGreaterThan(0);
  expect(getPathsWithFill(chart, TOTAL_COLOR).length).toBeGreaterThan(0);
  expect(within(chart).getByText(xLabel)).toBeInTheDocument();
  expect(within(chart).getByText(yLabel)).toBeInTheDocument();
}

type ChartPoint = { x: number; y: number };

function getChartSurface(chart: HTMLElement) {
  return checkNotNull(chart.querySelector("svg"));
}

/**
 * The coordinates of a point that hits a chart element. zrender finds the
 * hovered element by geometry rather than by DOM target. Matching elements are
 * ordered from left to right.
 */
function getChartElementPoint(
  chart: HTMLElement,
  isTarget: (style: { fill?: unknown; opacity?: unknown }) => boolean,
  index = 0,
): ChartPoint {
  const zr = checkNotNull(getInstanceByDom(chart)).getZr();
  const elements = zr.storage
    .getDisplayList()
    .filter((element) => isTarget(element.style))
    .map((element) => {
      const rect = element.getBoundingRect().clone();
      rect.applyTransform(element.getComputedTransform());
      return { element, rect };
    })
    .sort((a, b) => a.rect.x - b.rect.x);
  const { element, rect } = checkNotNull(elements.at(index));
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = rect.x + (rect.width * i) / STEPS;
      const y = rect.y + (rect.height * j) / STEPS;
      if (zr.handler.findHover(x, y).target === element) {
        return { x, y };
      }
    }
  }
  throw new Error(`No point hits the chart element at ${index}`);
}

function hoverChartPoint(chart: HTMLElement, { x, y }: ChartPoint) {
  fireEvent.mouseMove(getChartSurface(chart), { clientX: x, clientY: y });
}

function hoverChartElement(
  chart: HTMLElement,
  isTarget: (style: { fill?: unknown; opacity?: unknown }) => boolean,
  index = 0,
) {
  hoverChartPoint(chart, getChartElementPoint(chart, isTarget, index));
}

function assertTooltipRow(
  tooltip: HTMLElement,
  { name, value, color }: { name: string; value: string; color?: string },
) {
  // eslint-disable-next-line testing-library/no-node-access -- a tooltip row is a table row with no accessible name
  const row = checkNotNull(within(tooltip).getByText(name).closest("tr"));
  expect(within(row).getByText(value)).toBeInTheDocument();
  if (color) {
    // eslint-disable-next-line testing-library/no-node-access -- the series color is a styled marker with no role or label
    expect(row.querySelector("td span")).toHaveClass(
      `marker-${color.replace("#", "")}`,
    );
  }
}

function getGoalLines(chart: HTMLElement) {
  return chart.querySelectorAll(`path[stroke-dasharray='${GOAL_LINE_DASH}']`);
}

function getGoalLineMarkers(chart: HTMLElement) {
  return chart.querySelectorAll("path[fill-opacity='0']");
}

// the goal marker's hit area is a transparent circle
const isGoalMarkerHitArea = (style: { opacity?: unknown }) =>
  style.opacity === 0;

const withFill = (fill: string) => (style: { fill?: unknown }) =>
  style.fill === fill;

describe("QueryBuilder > waterfall chart", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });
  });

  it("should work with ordinal series", async () => {
    await setup({
      card: createNativeCard({
        id: 1,
        query:
          "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
      }),
      dataset: createDataset(
        [
          createNativeColumn("PRODUCT", "type/Text"),
          createNativeColumn("PROFIT", "type/Integer"),
        ],
        [
          ["A", 10],
          ["B", -4],
        ],
      ),
    });
    await switchToWaterfall();
    await assertWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with quantitative and ordinal series and numeric X-axis (metabase#15550)", async () => {
    await setup({
      card: createNativeCard({
        id: 2,
        query: "select 1 as X, 20 as Y union select 2 as X, -10 as Y",
      }),
      dataset: createDataset(
        [
          createNativeColumn("X", "type/Integer"),
          createNativeColumn("Y", "type/Integer"),
        ],
        [
          [1, 20],
          [2, -10],
        ],
      ),
    });
    await switchToWaterfall();

    await pickField(0, "X");
    await pickField(1, "Y");
    await assertWaterfallRendering("X", "Y");

    await openSettingsTab("Axes");
    const [xAxisScale] =
      within(getSettingsSidebar()).getAllByDisplayValue("Linear");
    await userEvent.click(xAxisScale);
    await userEvent.click(
      await screen.findByRole("option", { name: "Ordinal" }),
    );
    expect(
      within(getSettingsSidebar()).getByDisplayValue("Ordinal"),
    ).toBeInTheDocument();
    await assertWaterfallRendering("X", "Y");
  });

  it("should work with time-series data", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "table",
        visualization_settings: {},
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        }),
      }),
      matches: isCountByMonthQuery,
      dataset: createDataset(
        [createCreatedAtColumn("month"), COUNT_COLUMN],
        [
          ["2025-04-01T00:00:00Z", 10],
          ["2025-05-01T00:00:00Z", 30],
          ["2025-06-01T00:00:00Z", 45],
          ["2025-07-01T00:00:00Z", 60],
          ["2025-08-01T00:00:00Z", 65],
        ],
      ),
    });
    await switchToWaterfall();
    await assertWaterfallRendering("Created At: Month", "Count");
  });

  it("should keep the Total label and drop the date label crowding it", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "table",
        visualization_settings: {},
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        }),
      }),
      matches: isCountByMonthQuery,
      dataset: createDataset(
        [createCreatedAtColumn("month"), COUNT_COLUMN],
        // April 2025 to April 2029
        Array.from({ length: 49 }, (_, index) => [
          new Date(Date.UTC(2025, 3 + index, 1)).toISOString(),
          400 + index,
        ]),
      ),
    });
    await switchToWaterfall();

    const chart = await getChart();
    await waitFor(() =>
      expect(within(chart).getByText("Total")).toBeInTheDocument(),
    );
    expect(getPathsWithFill(chart, TOTAL_COLOR).length).toBeGreaterThan(0);
    // the same yearly grid labels April 2028
    expect(within(chart).getByText("April 2028")).toBeInTheDocument();
    // the last month sits one month before the Total and gives way to it
    expect(within(chart).queryByText("April 2029")).not.toBeInTheDocument();
  });

  describe("multi-series (metabase#15152)", () => {
    async function assertSwitchingToSingleSeries() {
      await switchToWaterfall();
      const chart = await getChart();
      await waitFor(() =>
        expect(within(chart).getByText("Total")).toBeInTheDocument(),
      );
      expect(within(chart).getByText("Created At: Year")).toBeInTheDocument();
      expect(within(chart).getByText("Count")).toBeInTheDocument();
      expect(within(chart).queryByText("Sum of Total")).not.toBeInTheDocument();
      for (const label of ["2025", "2026", "2029"]) {
        expect(within(chart).getByText(label)).toBeInTheDocument();
      }
      for (const label of ["0", "3,000", "6,000", "18,000", "21,000"]) {
        expect(within(chart).getByText(label)).toBeInTheDocument();
      }

      const sidebar = getSettingsSidebar();
      expect(within(sidebar).getByDisplayValue("Count")).toBeInTheDocument();
      expect(
        within(sidebar).queryByDisplayValue("Sum of Total"),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar).queryByText(/Add another/),
      ).not.toBeInTheDocument();

      await userEvent.click(within(sidebar).getByDisplayValue("Count"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Sum of Total" }),
      );
      await waitFor(() =>
        expect(
          within(sidebar).getByDisplayValue("Sum of Total"),
        ).toBeInTheDocument(),
      );
      expect(
        within(sidebar).queryByDisplayValue("Count"),
      ).not.toBeInTheDocument();

      await waitFor(() =>
        expect(within(chart).getByText("Sum of Total")).toBeInTheDocument(),
      );
      expect(within(chart).getByText("Created At: Year")).toBeInTheDocument();
      expect(within(chart).queryByText("Count")).not.toBeInTheDocument();
      for (const label of ["2025", "2026", "2029", "Total"]) {
        expect(within(chart).getByText(label)).toBeInTheDocument();
      }
      for (const label of ["0", "300,000", "900,000", "1,800,000"]) {
        expect(within(chart).getByText(label)).toBeInTheDocument();
      }
    }

    it("should correctly switch into single-series mode for ad-hoc queries", async () => {
      await setupAdhocQuestion({
        card: createMockUnsavedCard({
          display: "line",
          displayIsLocked: true,
          visualization_settings: {},
          dataset_query: createStructuredQuery(COUNT_AND_SUM_BY_YEAR_STAGE),
        }),
        matches: isCountAndSumByYearQuery,
        dataset: COUNT_AND_SUM_BY_YEAR_DATASET,
      });
      await assertSwitchingToSingleSeries();
    });

    it("should correctly switch into single-series mode for saved questions", async () => {
      await setup({
        card: createMockCard({
          id: 3,
          name: "Q1",
          display: "line",
          visualization_settings: {},
          dataset_query: createStructuredQuery(COUNT_AND_SUM_BY_YEAR_STAGE),
        }),
        dataset: COUNT_AND_SUM_BY_YEAR_DATASET,
      });
      await assertSwitchingToSingleSeries();
    });
  });

  it("should not allow you to choose X-axis breakout", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "line",
        displayIsLocked: true,
        visualization_settings: {},
        dataset_query: createStructuredQuery({
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "year" },
            {
              type: "column",
              fieldId: PRODUCTS.CATEGORY,
              sourceFieldId: ORDERS.PRODUCT_ID,
            },
          ],
        }),
      }),
      matches: isCountByYearAndCategoryQuery,
      dataset: createDataset(
        [
          createCreatedAtColumn("year"),
          createProductsCategoryDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              PRODUCTS.CATEGORY,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          }),
          COUNT_COLUMN,
        ],
        YEARS.flatMap((year, yearIndex) =>
          CATEGORIES.map((category, categoryIndex) => [
            `${year}-01-01T00:00:00Z`,
            category,
            100 * (yearIndex + 1) + categoryIndex,
          ]),
        ),
      ),
    });
    await switchToWaterfall();

    await pickField(0, "Created At: Year");
    await pickField(1, "Count");

    const chart = await getChart();
    await waitFor(() =>
      expect(within(chart).getByText("Total")).toBeInTheDocument(),
    );
    const sidebar = getSettingsSidebar();
    expect(
      within(sidebar).getByDisplayValue("Created At: Year"),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Add series breakout"),
    ).not.toBeInTheDocument();
    expect(within(sidebar).queryByText(/Add another/)).not.toBeInTheDocument();
  });

  it("should work for unaggregated data (metabase#15465)", async () => {
    await setup({
      card: createNativeCard({
        id: 4,
        query: UNAGGREGATED_QUERY,
        visualizationSettings: { "graph.show_values": true },
      }),
      dataset: createDataset(
        [
          createNativeColumn("d", "type/DateTime"),
          createNativeColumn("c", "type/Integer"),
        ],
        [
          ["2026-01-01T00:00:00Z", 1],
          ["2026-01-01T00:00:00Z", 2],
          ["2026-01-02T00:00:00Z", 3],
        ],
      ),
    });
    await switchToWaterfall();
    await assertWaterfallRendering("d", "c");
    // the rows of a day add up to one bar
    expect(getDataLabels(await getChart())).toEqual(["3", "3", "6"]);
  });

  describe("data labels (metabase#16246)", () => {
    const createValuesCard = (id: number, values: (number | null)[]) =>
      createNativeCard({
        id,
        query: `SELECT * FROM (VALUES ${values.map((value, index) => `('${"abcdefg"[index]}', ${value})`).join(", ")})`,
        display: "waterfall",
        visualizationSettings: { "graph.show_values": true },
      });

    const createValuesDataset = (values: (number | null)[]) =>
      createDataset(
        [
          createNativeColumn("C1", "type/Text"),
          createNativeColumn("C2", "type/Decimal"),
        ],
        values.map((value, index) => ["abcdefg"[index], value]),
      );

    it("should display correct values when one of them is 0", async () => {
      const values = [2, 1, -0.5, -0.5, 0.1, 0, -2];
      await setup({
        card: createValuesCard(5, values),
        dataset: createValuesDataset(values),
      });

      const chart = await getChart();
      await waitFor(() => expect(getDataLabels(chart)).toHaveLength(8));
      const labels = getDataLabels(chart);
      expect(labels.at(-3)).toBe("0");
      expect(labels.at(-2)).toBe("(2)");
      expect(labels.at(-1)).toBe("0.1");
    });

    it("should not display null values", async () => {
      const values = [2, 1, -0.5, -0.5, 0.1, null, -2];
      await setup({
        card: createValuesCard(6, values),
        dataset: createValuesDataset(values),
      });

      const chart = await getChart();
      // the null data point has no label
      await waitFor(() => expect(getDataLabels(chart)).toHaveLength(7));
      const labels = getDataLabels(chart);
      expect(labels.at(-3)).toBe("0.1");
      expect(labels.at(-2)).toBe("(2)");
      expect(labels.at(-1)).toBe("0.1");
      // but the x-axis label is still shown for the null data point
      expect(within(chart).getByText("f")).toBeInTheDocument();
    });
  });

  it("should correctly apply column value scaling in tooltips (metabase#44176)", async () => {
    const values = [2, 1, -0.5, -0.5, 0.1, -2];
    await setup({
      card: createNativeCard({
        id: 7,
        query:
          "SELECT * FROM (VALUES ('a',2), ('b',1), ('c',-0.5), ('d',-0.5), ('e',0.1), ('f', -2))",
        display: "waterfall",
        visualizationSettings: {
          "graph.show_values": true,
          column_settings: { '["name","C2"]': { scale: 0.1 } },
        },
      }),
      dataset: createDataset(
        [
          createNativeColumn("C1", "type/Text"),
          createNativeColumn("C2", "type/Decimal"),
        ],
        values.map((value, index) => ["abcdef"[index], value]),
      ),
    });

    const chart = await getChart();
    await waitFor(() => expect(getDataLabels(chart)).toHaveLength(7));
    expect(getDataLabels(chart)[0]).toBe("0.2");
    expect(getDataLabels(chart)[1]).toBe("0.1");

    // the second increase bar, so a tooltip of the first bar cannot pass
    hoverChartElement(chart, withFill(INCREASE_COLOR), 1);
    const tooltip = await screen.findByTestId("echarts-tooltip");
    expect(
      within(tooltip).getByTestId("echarts-tooltip-header"),
    ).toHaveTextContent("b");
    assertTooltipRow(tooltip, { name: "C2", value: "0.1" });
  });

  it("should show the total bar tooltip, allow adding non-series columns to the tooltip, and display a goal line (metabase#48118)", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "waterfall",
        displayIsLocked: true,
        visualization_settings: {
          "waterfall.increase_color": CUSTOM_INCREASE_COLOR,
        },
        dataset_query: createStructuredQuery(COUNT_AND_SUM_BY_YEAR_STAGE),
      }),
      matches: isCountAndSumByYearQuery,
      dataset: COUNT_AND_SUM_BY_YEAR_DATASET,
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(getPathsWithFill(chart, TOTAL_COLOR)).toHaveLength(1),
    );

    // ECharts draws a hovered bar in another color, so this finds the bar
    // of the second year while no bar is hovered
    const secondYearPoint = getChartElementPoint(
      chart,
      withFill(CUSTOM_INCREASE_COLOR),
      1,
    );
    hoverChartElement(chart, withFill(TOTAL_COLOR));
    let tooltip = await screen.findByTestId("echarts-tooltip");
    expect(
      within(tooltip).getByTestId("echarts-tooltip-header"),
    ).toHaveTextContent(/^Total$/);
    assertTooltipRow(tooltip, {
      name: "Count",
      value: "18,760",
      color: TOTAL_COLOR,
    });

    // the second year, so a tooltip of the first bar cannot pass
    hoverChartPoint(chart, secondYearPoint);
    await waitFor(() =>
      expect(
        within(screen.getByTestId("echarts-tooltip")).getByTestId(
          "echarts-tooltip-header",
        ),
      ).toHaveTextContent(/^2026$/),
    );
    tooltip = screen.getByTestId("echarts-tooltip");
    assertTooltipRow(tooltip, {
      name: "Count",
      value: "2,607",
      color: CUSTOM_INCREASE_COLOR,
    });
    expect(within(tooltip).queryByText("Sum of Total")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("viz-settings-button"));
    await openSettingsTab("Display");
    await userEvent.click(
      within(getSettingsSidebar()).getByPlaceholderText("Enter column names"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Sum of Total" }),
    );

    hoverChartPoint(chart, secondYearPoint);
    await waitFor(() =>
      expect(
        within(screen.getByTestId("echarts-tooltip")).getByText("Sum of Total"),
      ).toBeInTheDocument(),
    );
    tooltip = screen.getByTestId("echarts-tooltip");
    expect(
      within(tooltip).getByTestId("echarts-tooltip-header"),
    ).toHaveTextContent(/^2026$/);
    assertTooltipRow(tooltip, {
      name: "Count",
      value: "2,607",
      color: CUSTOM_INCREASE_COLOR,
    });
    assertTooltipRow(tooltip, { name: "Sum of Total", value: "205,256.02" });

    expect(getGoalLines(chart)).toHaveLength(0);
    await userEvent.click(
      within(getSettingsSidebar()).getByRole("switch", { name: "Goal line" }),
    );
    const goalValue = within(getSettingsSidebar()).getByLabelText("Goal value");
    await userEvent.clear(goalValue);
    await userEvent.type(goalValue, "11000");
    await userEvent.tab();
    const goalLabel = within(getSettingsSidebar()).getByLabelText("Goal label");
    await userEvent.clear(goalLabel);
    await userEvent.type(goalLabel, "Target");
    await userEvent.tab();

    await waitFor(() => expect(getGoalLines(chart).length).toBeGreaterThan(0));
    expect(getGoalLineMarkers(chart).length).toBeGreaterThan(0);
    // the marker reveals the typed goal
    hoverChartElement(chart, isGoalMarkerHitArea);
    const goalTooltip = await screen.findByRole("tooltip");
    expect(within(goalTooltip).getByText("Target:")).toBeInTheDocument();
    expect(within(goalTooltip).getByText("11,000")).toBeInTheDocument();
  });

  it("should show the goal in a tooltip when hovering the goal marker", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "waterfall",
        displayIsLocked: true,
        visualization_settings: {
          "graph.show_goal": true,
          "graph.goal_value": 11000,
          "graph.goal_label": "Target",
        },
        dataset_query: createStructuredQuery(COUNT_AND_SUM_BY_YEAR_STAGE),
      }),
      matches: isCountAndSumByYearQuery,
      dataset: COUNT_AND_SUM_BY_YEAR_DATASET,
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(getGoalLineMarkers(chart).length).toBeGreaterThan(0),
    );

    hoverChartElement(chart, isGoalMarkerHitArea);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Target:")).toBeInTheDocument();
    expect(within(tooltip).getByText("11,000")).toBeInTheDocument();
  });

  describe("waterfall settings", () => {
    it("should allow toggling of the total bar and value labels, and have color options", async () => {
      await setup({
        card: createNativeCard({ id: 8, query: "select 'A' as X, -4.56 as Y" }),
        dataset: createDataset(
          [
            createNativeColumn("X", "type/Text"),
            createNativeColumn("Y", "type/Decimal"),
          ],
          [["A", -4.56]],
        ),
      });
      await switchToWaterfall();
      await openSettingsTab("Display");

      const chart = await getChart();
      await waitFor(() =>
        expect(within(chart).getByText("Total")).toBeInTheDocument(),
      );
      const showTotal = within(getSettingsSidebar()).getByRole("switch", {
        name: "Show total",
      });

      await userEvent.click(showTotal);
      await waitFor(() =>
        expect(within(chart).queryByText("Total")).not.toBeInTheDocument(),
      );
      expect(getPathsWithFill(chart, TOTAL_COLOR)).toHaveLength(0);
      expect(within(chart).getByText("A")).toBeInTheDocument();

      await userEvent.click(showTotal);
      await waitFor(() =>
        expect(within(chart).getByText("Total")).toBeInTheDocument(),
      );
      expect(getPathsWithFill(chart, TOTAL_COLOR).length).toBeGreaterThan(0);
      expect(within(chart).queryAllByText("(4.56)")).toHaveLength(0);

      await userEvent.click(
        within(getSettingsSidebar()).getByRole("switch", {
          name: "Show values on data points",
        }),
      );
      // the bar and the Total
      await waitFor(() =>
        expect(getDataLabels(chart)).toEqual(["(4.56)", "(4.56)"]),
      );

      for (const title of ["Increase color", "Decrease color", "Total color"]) {
        expect(
          within(getSettingsSidebar()).getByText(title),
        ).toBeInTheDocument();
      }
    });
  });
});
