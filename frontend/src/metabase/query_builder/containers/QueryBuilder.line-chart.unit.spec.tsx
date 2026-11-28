import userEvent from "@testing-library/user-event";
import { getInstanceByDom } from "echarts/core";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { serializeCardForUrl } from "metabase/common/utils/card";
import { color } from "metabase/ui/colors";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { TREND_LINE_WIDTH } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DatasetColumn,
  Insight,
  RowValue,
  TestStageWithSourceSpec,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockInsight,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createPeopleLatitudeDatasetColumn,
  createPeopleLongitudeDatasetColumn,
  createProductsCategoryDatasetColumn,
  createProductsCreatedAtDatasetColumn,
  createProductsRatingDatasetColumn,
  createProductsTitleDatasetColumn,
  createReviewsReviewerDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { setup, waitForQueryToStart } from "./test-utils";

registerVisualizations();

const CIRCLE_PATH = "M1 0A1 1 0 1 1 1 -0.0001";
// the fill of the data point circles, which an out-of-range point does not get
const DATA_POINT_FILL = "hsla(0, 0%, 100%, 1.00)";

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

interface AggregationColumnOpts {
  name: string;
  displayName: string;
  index: number;
  baseType?: string;
  semanticType?: string | null;
}

function createAggregationColumn({
  name,
  displayName,
  index,
  baseType = "type/BigInteger",
  semanticType = null,
}: AggregationColumnOpts): DatasetColumn {
  return createMockColumn({
    name,
    display_name: displayName,
    source: "aggregation",
    base_type: baseType,
    effective_type: baseType,
    semantic_type: semanticType,
    field_ref: ["aggregation", index],
  });
}

type TemporalUnit = "week" | "month" | "year";

const UNIT_NAMES: Record<TemporalUnit, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
};

function createCreatedAtColumn(unit: TemporalUnit): DatasetColumn {
  return createOrdersCreatedAtDatasetColumn({
    source: "breakout",
    unit,
    display_name: `Created At: ${UNIT_NAMES[unit]}`,
    field_ref: [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": unit },
    ],
  });
}

function createProductsCreatedAtYearColumn(): DatasetColumn {
  return createProductsCreatedAtDatasetColumn({
    source: "breakout",
    unit: "year",
    display_name: "Created At: Year",
    field_ref: [
      "field",
      PRODUCTS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": "year" },
    ],
  });
}

function createCategoryColumn(): DatasetColumn {
  return createProductsCategoryDatasetColumn({
    source: "breakout",
    field_ref: ["field", PRODUCTS.CATEGORY, null],
  });
}

function createDataset(
  cols: DatasetColumn[],
  rows: RowValue[][],
  insights?: Insight[],
): Dataset {
  const dataset = createMockDataset({
    data: createMockDatasetData({ cols, rows, insights }),
    row_count: rows.length,
  });
  // the backend adds `rows_truncated` only to truncated results, and a chart
  // warns about it
  Reflect.deleteProperty(dataset.data, "rows_truncated");
  return dataset;
}

const EMPTY_DATASET = createDataset([], []);

function createStructuredQuery(stage: TestStageWithSourceSpec) {
  return Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, { stages: [stage] }),
  );
}

function createNativeQuery(query: string) {
  return Lib.toJsQuery(Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query }));
}

// the backend computes insights, a linear fit, for time series results
function createYearlyInsight(col: string): Insight {
  return createMockInsight({ col, unit: "year", slope: 0.1, offset: 50 });
}

const COUNT_COLUMN = createAggregationColumn({
  name: "count",
  displayName: "Count",
  index: 0,
});

const YEARS = ["2025", "2026", "2027", "2028", "2029"];
const YEAR_DATES = YEARS.map((year) => `${year}-01-01T00:00:00Z`);
const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];

const COUNT_BY_MONTH_STAGE: TestStageWithSourceSpec = {
  source: { type: "table", id: ORDERS_ID },
  aggregations: [{ type: "operator", operator: "count", args: [] }],
  breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
};

const COUNT_BY_YEAR_STAGE: TestStageWithSourceSpec = {
  ...COUNT_BY_MONTH_STAGE,
  breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
};

// April 2025 to April 2029
const MONTHS = Array.from({ length: 49 }, (_, index) =>
  new Date(Date.UTC(2025, 3 + index, 1)).toISOString(),
);

// 100 to 580, so a 0 to 600 axis
const COUNT_BY_MONTH_DATASET = createDataset(
  [createCreatedAtColumn("month"), COUNT_COLUMN],
  MONTHS.map((month, index) => [month, 100 + index * 10]),
);

const COUNT_BY_YEAR_DATASET = createDataset(
  [createCreatedAtColumn("year"), COUNT_COLUMN],
  YEAR_DATES.map((year, index) => [year, 744 + index * 1500]),
  [createYearlyInsight("count")],
);

function sumOf(column: string) {
  return {
    type: "operator" as const,
    operator: "sum",
    args: [{ type: "column" as const, name: column }],
  };
}

function aggregationOf(operator: string, column: string) {
  return {
    type: "operator" as const,
    operator,
    args: [{ type: "column" as const, name: column }],
  };
}

interface SavedQuestionOpts {
  id?: number;
  query?: Card["dataset_query"];
  dataset: Dataset;
  display?: Card["display"];
  settings?: VisualizationSettings;
}

async function setupSavedQuestion({
  id = 1,
  query = createStructuredQuery(COUNT_BY_MONTH_STAGE),
  dataset,
  display = "line",
  settings = {},
}: SavedQuestionOpts) {
  return setup({
    card: createMockCard({
      id,
      name: "Line question",
      display,
      visualization_settings: settings,
      dataset_query: query,
    }),
    dataset,
  });
}

function getRequestBody(call: CallLog): unknown {
  return JSON.parse(String(call.options.body));
}

function removeUuids(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUuids);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, item]) => [key, removeUuids(item)]),
    );
  }
  return value;
}

/** The request runs the card's query: the same database and stages */
function isCardQuery(body: unknown, card: UnsavedCard) {
  return (
    _.isObject(body) &&
    Reflect.get(body, "database") === SAMPLE_DB_ID &&
    _.isEqual(
      removeUuids(Reflect.get(body, "stages")),
      removeUuids(Reflect.get(card.dataset_query, "stages")),
    )
  );
}

interface AdhocQuestionOpts {
  card: UnsavedCard;
  dataset: Dataset;
}

/**
 * Opens an ad-hoc question. POST /api/dataset returns the rows only for the
 * card's query, and no rows for any other query.
 */
async function setupAdhocQuestion({ card, dataset }: AdhocQuestionOpts) {
  const result = await setup({
    card,
    initialRoute: `/question#${serializeCardForUrl(card, { includeDisplayIsLocked: true })}`,
    waitForLoad: false,
  });
  fetchMock.modifyRoute("dataset-post", {
    response: (call: CallLog) =>
      isCardQuery(getRequestBody(call), card) ? dataset : EMPTY_DATASET,
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

function getCircles(chart: HTMLElement, stroke?: string) {
  const selector = stroke
    ? `path[d="${CIRCLE_PATH}"][stroke="${stroke}"]`
    : `path[d="${CIRCLE_PATH}"]`;
  return chart.querySelectorAll(selector);
}

function getDataPoints(chart: HTMLElement) {
  return chart.querySelectorAll(`path[fill='${DATA_POINT_FILL}']`);
}

function getTrendLines(chart: HTMLElement) {
  // goal marker rings share the stroke width, but only lines use bevel joins
  return Array.from(
    chart.querySelectorAll(
      `path[stroke-width='${TREND_LINE_WIDTH}'][stroke-linejoin='bevel']`,
    ),
  );
}

function getPathsWithFill(chart: HTMLElement, fill: string) {
  return chart.querySelectorAll(`path[fill='${fill}']`);
}

function getSplitPanelSeparators(chart: HTMLElement) {
  return chart.querySelectorAll(
    `path[stroke="${color("border-neutral-strong")}"]`,
  );
}

function getDataLabels(chart: HTMLElement) {
  return Array.from(
    chart.querySelectorAll("text[paint-order='stroke']"),
    (text) => text.textContent ?? "",
  );
}

function getXYTransform(element: Element) {
  const transform = checkNotNull(element.getAttribute("transform"));
  const matrix = checkNotNull(transform.match(/matrix\(([^)]+)\)/));
  const [, , , , x, y] = matrix[1].split(/[ ,]+/).map(Number);
  return { x, y };
}

type ChartPoint = { x: number; y: number };

interface ChartElementStyle {
  fill?: unknown;
  stroke?: unknown;
  opacity?: unknown;
}

/**
 * The center of a chart element. zrender finds the hovered element by geometry
 * rather than by DOM target. Matching elements are ordered from left to right.
 */
function getChartElementPoint(
  chart: HTMLElement,
  isTarget: (style: ChartElementStyle, isSymbol: boolean) => boolean,
  index = 0,
): ChartPoint {
  const zr = checkNotNull(getInstanceByDom(chart)).getZr();
  const elements = zr.storage
    .getDisplayList()
    .filter((element) => {
      const shape: unknown = Reflect.get(element, "shape");
      const isSymbol =
        _.isObject(shape) && Reflect.get(shape, "symbolType") != null;
      return isTarget(element.style, isSymbol);
    })
    .map((element) => {
      const rect = element.getBoundingRect().clone();
      rect.applyTransform(element.getComputedTransform());
      return rect;
    })
    .sort((a, b) => a.x - b.x);
  const rect = checkNotNull(elements.at(index));
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function getChartSurface(chart: HTMLElement) {
  return checkNotNull(chart.querySelector("svg"));
}

function hoverChartPoint(chart: HTMLElement, { x, y }: ChartPoint) {
  fireEvent.mouseMove(getChartSurface(chart), {
    clientX: x,
    clientY: y,
  });
}

function hoverDataPoint(chart: HTMLElement, stroke: string, index = 0) {
  hoverChartPoint(
    chart,
    getChartElementPoint(
      chart,
      (style, isSymbol) => isSymbol && style.stroke === stroke,
      index,
    ),
  );
}

// the goal marker's hit area is a transparent circle
function hoverGoalMarker(chart: HTMLElement) {
  hoverChartPoint(
    chart,
    getChartElementPoint(chart, (style) => style.opacity === 0),
  );
}

async function getTooltip(header: string) {
  await waitFor(() =>
    expect(
      within(screen.getByTestId("echarts-tooltip")).getByTestId(
        "echarts-tooltip-header",
      ),
    ).toHaveTextContent(new RegExp(`^${header}$`)),
  );
  return screen.getByTestId("echarts-tooltip");
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

async function openVizSettings() {
  await userEvent.click(screen.getByTestId("viz-settings-button"));
  return screen.findByTestId("chartsettings-sidebar");
}

async function openSeriesSettings(key: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByTestId(`settings-${key}`),
  );
  return screen.findByRole("dialog");
}

async function openBreakoutSeriesSettings(title: string) {
  await userEvent.click(
    within(screen.getByTestId(`draggable-item-${title}`)).getByLabelText(
      "ellipsis icon",
    ),
  );
  return screen.findByRole("dialog");
}

async function pickColor(trigger: HTMLElement, hex: string) {
  await userEvent.click(trigger);
  const colorPopover = await screen.findByTestId("color-selector-popover");
  await userEvent.click(within(colorPopover).getByLabelText(hex));
}

function getColorSelectorButton(container: HTMLElement) {
  return within(
    within(container).getByTestId("color-selector-button"),
  ).getByRole("button");
}

async function closePopover(element: HTMLElement) {
  // the popover closes on Escape only when the key event starts inside it
  element.focus();
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

async function openSettingsTab(name: string) {
  await userEvent.click(
    within(getSettingsSidebar()).getByRole("tab", { name }),
  );
}

async function openVizTypeSidebar() {
  await userEvent.click(screen.getByTestId("viz-type-button"));
  return screen.findByTestId("chart-type-sidebar");
}

async function switchToLine() {
  const sidebar = await openVizTypeSidebar();
  await userEvent.click(within(sidebar).getByTestId("Line-button"));
}

async function typeInto(input: HTMLElement, text: string) {
  await userEvent.clear(input);
  await userEvent.type(input, text);
  await userEvent.tab();
}

describe("QueryBuilder > line chart", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });
  });

  it("should change formatting, y-axis position, color and line settings of a series (metabase#51952, metabase#13487, metabase#53735)", async () => {
    await setupSavedQuestion({ dataset: COUNT_BY_MONTH_DATASET });
    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    await openVizSettings();

    // x-axis column settings (metabase#51952)
    expect(within(chart).getByText("April 2027")).toBeInTheDocument();
    await userEvent.click(
      within(getSettingsSidebar()).getByTestId("settings-CREATED_AT"),
    );
    let popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByText("Abbreviate days and months"),
    );
    await waitFor(() =>
      expect(within(chart).getByText("Apr 2027")).toBeInTheDocument(),
    );
    expect(within(chart).queryByText("April 2027")).not.toBeInTheDocument();
    await closePopover(
      within(popover).getByRole("switch", {
        name: "Abbreviate days and months",
      }),
    );

    // series formatting settings
    popover = await openSeriesSettings("count");
    await userEvent.click(
      within(popover).getByRole("tab", { name: "Formatting" }),
    );
    expect(within(popover).getByText("Add a prefix")).toBeInTheDocument();
    expect(within(chart).queryByText("prefix0")).not.toBeInTheDocument();
    const prefixInput = within(popover).getByPlaceholderText("$");
    await userEvent.type(prefixInput, "prefix");
    await userEvent.tab();
    await waitFor(() =>
      expect(within(chart).getByText("prefix0")).toBeInTheDocument(),
    );
    await closePopover(within(popover).getByPlaceholderText("$"));

    // y-axis position (metabase#13487)
    popover = await openSeriesSettings("count");
    const leftPosition = getXYTransform(within(chart).getByText("Count"));
    await userEvent.click(within(popover).getByText("Right"));
    await waitFor(() =>
      expect(
        getXYTransform(within(chart).getByText("Count")).x,
      ).toBeGreaterThan(leftPosition.x),
    );
    expect(getXYTransform(within(chart).getByText("Count")).y).toBe(
      leftPosition.y,
    );

    // series color (metabase#53735)
    expect(getCircles(chart, "#EF8C8C")).toHaveLength(0);
    await pickColor(getColorSelectorButton(popover), "#EF8C8C");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(getCircles(chart, "#EF8C8C").length).toBeGreaterThan(0),
    );
    expect(getCircles(chart, "#509EE3")).toHaveLength(0);

    // line settings show only for line and area charts
    await openVizSettings();
    popover = await openSeriesSettings("count");
    const LINE_SETTINGS = [
      "Line shape",
      "Line style",
      "Line size",
      "Show dots on lines",
    ];
    for (const title of LINE_SETTINGS) {
      expect(within(popover).getByText(title)).toBeInTheDocument();
    }
    await userEvent.click(within(popover).getByRole("radio", { name: "Area" }));
    for (const title of LINE_SETTINGS) {
      expect(within(popover).getByText(title)).toBeInTheDocument();
    }
    await userEvent.click(within(popover).getByRole("radio", { name: "Bar" }));
    await waitFor(() =>
      expect(within(popover).queryByText("Line shape")).not.toBeInTheDocument(),
    );
    for (const title of LINE_SETTINGS) {
      expect(within(popover).queryByText(title)).not.toBeInTheDocument();
    }
  });

  it("should reset series settings when switching to line chart", async () => {
    await setupSavedQuestion({
      dataset: COUNT_BY_MONTH_DATASET,
      display: "area",
    });
    const chart = await getChart();
    await openVizSettings();
    const popover = await openSeriesSettings("count");
    await userEvent.click(within(popover).getByRole("radio", { name: "Bar" }));
    await waitFor(() => expect(getCircles(chart)).toHaveLength(0));

    await switchToLine();

    // should be a line chart
    await waitFor(async () =>
      expect(getCircles(await getChart(), "#509EE3").length).toBeGreaterThan(0),
    );
  });

  it("should reset stacking settings when switching to line chart (metabase#43538)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [aggregationOf("avg", "PRICE")],
        breakouts: [
          { type: "column", name: "CREATED_AT", unit: "year" },
          { type: "column", name: "CATEGORY" },
        ],
      }),
      dataset: createDataset(
        [
          createProductsCreatedAtYearColumn(),
          createCategoryColumn(),
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Price",
            index: 0,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.flatMap((year, yearIndex) =>
          CATEGORIES.map((category, categoryIndex) => [
            year,
            category,
            40 + yearIndex + categoryIndex * 5,
          ]),
        ),
      ),
      display: "bar",
      settings: { "stackable.stack_type": "normalized" },
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(within(chart).getByText("100%")).toBeInTheDocument(),
    );

    await switchToLine();

    await waitFor(async () =>
      expect(getCircles(await getChart(), "#A989C5").length).toBeGreaterThan(0),
    );
    // Y-axis scale should not be normalized
    expect(
      within(await getChart()).queryByText("100%"),
    ).not.toBeInTheDocument();
  });

  it("should be able to format data point values style independently on multi-series chart (metabase#13095)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          sumOf("TOTAL"),
          {
            name: "AvgPct",
            value: {
              type: "operator",
              operator: "/",
              args: [
                aggregationOf("avg", "QUANTITY"),
                { type: "literal", value: 10 },
              ],
            },
          },
        ],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("year"),
          createAggregationColumn({
            name: "sum",
            displayName: "Sum of Total",
            index: 0,
            baseType: "type/Float",
          }),
          createAggregationColumn({
            name: "expression",
            displayName: "AvgPct",
            index: 1,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.map((year, index) => [
          year,
          0.3 + index * 0.1,
          [0.3584, 0.3975, 0.3812, 0.3768, 0.3803][index],
        ]),
      ),
      settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });
    const chart = await getChart();

    // the second year, so a label of the first point cannot pass
    await waitFor(() => expect(getDataLabels(chart)).toContain("39.75%"));
    // the other series keeps its own style
    expect(getDataLabels(chart)).toContain("0.4");
    expect(getDataLabels(chart)).not.toContain("40%");
  });

  it("should let unpin y-axis from zero", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        ...COUNT_BY_YEAR_STAGE,
        aggregations: [aggregationOf("avg", "TOTAL")],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("year"),
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Total",
            index: 0,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.map((year, index) => [year, 56.6 + index * 0.9]),
      ),
      settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });
    const chart = await getChart();

    // The chart is pinned to zero by default: 0 tick should exist
    await waitFor(() =>
      expect(within(chart).getByText("0")).toBeInTheDocument(),
    );

    await openVizSettings();
    await openSettingsTab("Axes");
    const unpin = within(getSettingsSidebar()).getByRole("switch", {
      name: "Unpin from zero",
    });
    await userEvent.click(unpin);

    // Ensure unpinned chart does not have 0 tick
    await waitFor(() =>
      expect(within(chart).queryByText("0")).not.toBeInTheDocument(),
    );
    expect(within(chart).getByText("Average of Total")).toBeInTheDocument();

    await userEvent.click(unpin);
    await waitFor(() =>
      expect(within(chart).getByText("0")).toBeInTheDocument(),
    );
  });

  it("should show you a popover when all data points are outside the y-axis range (UXW-2696)", async () => {
    await setupSavedQuestion({
      dataset: COUNT_BY_MONTH_DATASET,
      settings: {
        "graph.y_axis.min": 700,
        "graph.y_axis.max": 1000,
        "graph.y_axis.auto_range": false,
      },
    });
    const chart = await getChart();
    const getNoPointsMessage = () =>
      screen.queryByRole("dialog", { name: /data points are off screen/i });

    const assertNoPoints = async () => {
      await waitFor(() => expect(getNoPointsMessage()).toBeInTheDocument());
      expect(getDataPoints(chart)).toHaveLength(0);
    };
    const assertDataVisible = async () => {
      await waitFor(() =>
        expect(getDataPoints(chart).length).toBeGreaterThan(0),
      );
      expect(getNoPointsMessage()).not.toBeInTheDocument();
    };

    await assertNoPoints();

    await openVizSettings();
    await openSettingsTab("Axes");
    const getMin = () => within(getSettingsSidebar()).getByLabelText("Min");
    await typeInto(getMin(), "70");
    await assertDataVisible();

    await typeInto(getMin(), "700");
    await assertNoPoints();

    await userEvent.click(
      within(getSettingsSidebar()).getByRole("switch", {
        name: /auto y-axis range/i,
      }),
    );
    await assertDataVisible();
  });

  it("should display an error message when there are more series than the chart supports", async () => {
    const titles = Array.from({ length: 101 }, (_, index) => `Title ${index}`);
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [
          { type: "column", name: "CREATED_AT", unit: "year" },
          { type: "column", name: "TITLE" },
        ],
      }),
      dataset: createDataset(
        [
          createProductsCreatedAtYearColumn(),
          createProductsTitleDatasetColumn({ source: "breakout" }),
          COUNT_COLUMN,
        ],
        YEAR_DATES.slice(0, 2).flatMap((year) =>
          titles.map((title) => [year, title, 1]),
        ),
      ),
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
  });

  it("should draw 100 series without the error message", async () => {
    const titles = Array.from({ length: 100 }, (_, index) => `Title ${index}`);
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [
          { type: "column", name: "CREATED_AT", unit: "year" },
          { type: "column", name: "TITLE" },
        ],
      }),
      dataset: createDataset(
        [
          createProductsCreatedAtYearColumn(),
          createProductsTitleDatasetColumn({ source: "breakout" }),
          COUNT_COLUMN,
        ],
        YEAR_DATES.slice(0, 2).flatMap((year) =>
          titles.map((title) => [year, title, 1]),
        ),
      ),
      settings: {
        "graph.dimensions": ["CREATED_AT", "TITLE"],
        "graph.metrics": ["count"],
      },
    });

    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    expect(
      screen.queryByText(
        "This chart type doesn't support more than 100 series of data.",
      ),
    ).not.toBeInTheDocument();
  });

  it("should not allow adding more series when all columns are used (metabase#11249)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        ...COUNT_BY_MONTH_STAGE,
        aggregations: [
          { type: "operator", operator: "count", args: [] },
          aggregationOf("avg", "TOTAL"),
        ],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("month"),
          COUNT_COLUMN,
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Total",
            index: 1,
            baseType: "type/Float",
          }),
        ],
        MONTHS.map((month, index) => [month, 100 + index, 50 + index / 10]),
      ),
      settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
      },
    });

    await openVizSettings();
    const sidebar = screen.getByTestId("sidebar-left");
    await userEvent.click(within(sidebar).getByRole("tab", { name: "Data" }));
    expect(
      within(sidebar).queryByDisplayValue("Count"),
    ).not.toBeInTheDocument();

    await userEvent.click(within(sidebar).getByText("Add another series"));
    expect(
      await within(sidebar).findByDisplayValue("Count"),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Add another series"),
    ).not.toBeInTheDocument();
  });

  it("should render a chart with many columns (metabase#21392)", async () => {
    const valueColumns = Array.from(
      { length: 32 },
      (_, index) => `C${String(index).padStart(2, "0")}`,
    );
    await setupSavedQuestion({
      query: createNativeQuery("SELECT ROWNUM() id, ... FROM L3"),
      dataset: createDataset(
        [
          createNativeColumn("ID", "type/BigInteger"),
          createNativeColumn("DATE", "type/Date"),
          ...valueColumns.map((name) => createNativeColumn(name, "type/Float")),
        ],
        Array.from({ length: 32 }, (_, rowIndex) => [
          rowIndex + 1,
          new Date(Date.UTC(2026, 0, rowIndex + 2)).toISOString().slice(0, 10),
          ...valueColumns.map(
            (_, columnIndex) => ((rowIndex * 7 + columnIndex * 13) % 100) / 100,
          ),
        ]),
      ),
    });

    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    // eslint-disable-next-line testing-library/no-node-access -- ECharts draws into one svg element
    expect(chart.querySelectorAll("svg")).toHaveLength(1);
  });

  it("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", async () => {
    const ratings = [0, 1, 2.5, 2.7, 3, 3.3, 4, 4.5];
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          { type: "operator", operator: "count", args: [] },
          sumOf("TOTAL"),
          aggregationOf("avg", "QUANTITY"),
        ],
        breakouts: [
          {
            type: "column",
            fieldId: PRODUCTS.RATING,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      }),
      dataset: createDataset(
        [
          createProductsRatingDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              PRODUCTS.RATING,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          }),
          COUNT_COLUMN,
          createAggregationColumn({
            name: "sum",
            displayName: "Sum of Total",
            index: 1,
            baseType: "type/Float",
          }),
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Quantity",
            index: 2,
            baseType: "type/Float",
          }),
        ],
        ratings.map((rating, index) =>
          rating === 2.7
            ? [rating, 191, 14747.05, 4.3]
            : [rating, 100 + index, 10000 + index, 3 + index / 10],
        ),
      ),
      settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(getCircles(chart, "#509EE3")).toHaveLength(ratings.length),
    );

    hoverDataPoint(chart, "#509EE3", 3);
    const tooltip = await getTooltip("2.7");
    assertTooltipRow(tooltip, {
      name: "Count",
      value: "191",
      color: "#509EE3",
    });
    assertTooltipRow(tooltip, {
      name: "Sum of Total",
      value: "14,747.05",
      color: "#88BF4D",
    });
    assertTooltipRow(tooltip, {
      name: "Average of Quantity",
      value: "4.3",
      color: "#A989C5",
    });
  });

  it("should show chart tooltip on narrow ordinal line charts (metabase#47847)", async () => {
    // 200 weeks from the week of April 27, 2025
    const weeks = Array.from({ length: 200 }, (_, index) =>
      new Date(Date.UTC(2025, 3, 27 + index * 7)).toISOString(),
    );
    await setupSavedQuestion({
      query: createStructuredQuery({
        ...COUNT_BY_MONTH_STAGE,
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "week" }],
      }),
      dataset: createDataset(
        [createCreatedAtColumn("week"), COUNT_COLUMN],
        weeks.map((week, index) => [week, index === 0 ? 1 : 50 + index]),
      ),
      settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.show_values": true,
      },
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(getCircles(chart, "#509EE3")).toHaveLength(weeks.length),
    );

    hoverDataPoint(chart, "#509EE3", 0);
    const tooltip = await getTooltip("April 27 – May 3, 2025");
    assertTooltipRow(tooltip, { name: "Count", value: "1", color: "#509EE3" });
  });

  it("should be possible to update/change label for an empty row value (metabase#12128)", async () => {
    await setupSavedQuestion({
      query: createNativeQuery(
        "SELECT '2026-03-01'::date as date, 'cat1' as category, 23 as \"value\" UNION ALL ...",
      ),
      dataset: createDataset(
        [
          createNativeColumn("DATE", "type/Date"),
          createNativeColumn("CATEGORY", "type/Text"),
          createNativeColumn("VALUE", "type/Integer"),
        ],
        [
          ["2026-03-01", "cat1", 23],
          ["2026-03-01", "", 44],
          ["2026-03-01", "cat3", 58],
          ["2026-03-02", "cat1", 20],
          ["2026-03-02", "", 50],
          ["2026-03-02", "cat3", 58],
        ],
      ),
      settings: {
        "graph.dimensions": ["DATE", "CATEGORY"],
        "graph.metrics": ["VALUE"],
      },
    });
    await openVizSettings();

    // Make sure we can update input with some existing value
    let popover = await openBreakoutSeriesSettings("cat1");
    await userEvent.type(within(popover).getByDisplayValue("cat1"), " new");
    await userEvent.tab();
    expect(within(popover).getByDisplayValue("cat1 new")).toBeInTheDocument();

    // Now do the same for the input with no value
    popover = await openBreakoutSeriesSettings("(empty)");
    await typeInto(within(popover).getByTestId("series-name-input"), "cat2");
    expect(within(popover).getByDisplayValue("cat2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(
        screen.getAllByTestId("legend-item").map((item) => item.textContent),
      ).toEqual(["cat1 new", "cat2", "cat3"]),
    );
  });

  it("should interpolate null value by not rendering a data point (metabase#4122)", async () => {
    await setupSavedQuestion({
      query: createNativeQuery(
        "select 'a' x, 1 y union all select 'b' x, null y union all select 'c' x, 2 y",
      ),
      dataset: createDataset(
        [
          createNativeColumn("X", "type/Text"),
          createNativeColumn("Y", "type/Integer"),
        ],
        [
          ["a", 1],
          ["b", null],
          ["c", 2],
        ],
      ),
    });
    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    expect(getCircles(chart)).toHaveLength(2);
    // the x-axis still has the null row
    expect(within(chart).getByText("b")).toBeInTheDocument();
  });

  it("should show label for empty value series breakout (metabase#32107)", async () => {
    await setupSavedQuestion({
      query: createNativeQuery(
        "select 1 id, 50 val1, null val2 union all select 2, 75, null",
      ),
      dataset: createDataset(
        [
          createNativeColumn("ID", "type/Integer"),
          createNativeColumn("VAL1", "type/Integer"),
          createNativeColumn("VAL2", "type/Integer"),
        ],
        [
          [1, 50, null],
          [2, 75, null],
          [3, 175, null],
          [4, 200, null],
          [5, 280, null],
        ],
      ),
      settings: {
        "graph.dimensions": ["ID", "VAL2"],
        "graph.series_order_dimension": null,
        "graph.series_order": null,
        "graph.metrics": ["VAL1"],
      },
    });

    const legendItem = await within(
      screen.getByTestId("visualization-root"),
    ).findByTestId("legend-item");
    expect(within(legendItem).getByText("(empty)")).toBeInTheDocument();

    await openVizSettings();
    expect(
      within(getSettingsSidebar()).getByText("(empty)"),
    ).toBeInTheDocument();
  });

  describe("y-axis splitting (metabase#12939)", () => {
    it("should not split the y-axis when columns are of the same semantic_type and have close values", async () => {
      await setupSavedQuestion({
        query: createStructuredQuery({
          ...COUNT_BY_MONTH_STAGE,
          aggregations: [
            aggregationOf("avg", "TOTAL"),
            aggregationOf("min", "TOTAL"),
          ],
        }),
        dataset: createDataset(
          [
            createCreatedAtColumn("month"),
            createAggregationColumn({
              name: "avg",
              displayName: "Average of Total",
              index: 0,
              baseType: "type/Float",
            }),
            createAggregationColumn({
              name: "min",
              displayName: "Min of Total",
              index: 1,
              baseType: "type/Float",
            }),
          ],
          MONTHS.map((month, index) => [
            month,
            60 + (index % 7),
            30 + (index % 5),
          ]),
        ),
      });
      const chart = await getChart();

      await waitFor(() =>
        expect(
          within(chart).getByText("Created At: Month"),
        ).toBeInTheDocument(),
      );
      expect(
        within(chart).queryByText("Average of Total"),
      ).not.toBeInTheDocument();
      expect(within(chart).queryByText("Min of Total")).not.toBeInTheDocument();
    });

    it("should split the y-axis when columns are of different semantic_type", async () => {
      await setupSavedQuestion({
        query: createStructuredQuery({
          source: { type: "table", id: PEOPLE_ID },
          aggregations: [
            aggregationOf("avg", "LATITUDE"),
            aggregationOf("avg", "LONGITUDE"),
          ],
          breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
        }),
        dataset: createDataset(
          [
            createCreatedAtColumn("month"),
            createAggregationColumn({
              name: "avg",
              displayName: "Average of Latitude",
              index: 0,
              baseType: "type/Float",
              semanticType: createPeopleLatitudeDatasetColumn().semantic_type,
            }),
            createAggregationColumn({
              name: "avg_2",
              displayName: "Average of Longitude",
              index: 1,
              baseType: "type/Float",
              semanticType: createPeopleLongitudeDatasetColumn().semantic_type,
            }),
          ],
          // close values, so only the semantic types split the axis
          MONTHS.map((month, index) => [
            month,
            39 + (index % 3),
            38 + (index % 4),
          ]),
        ),
      });
      const chart = await getChart();

      await waitFor(() =>
        expect(
          within(chart).getByText("Average of Latitude"),
        ).toBeInTheDocument(),
      );
      expect(
        within(chart).getByText("Average of Longitude"),
      ).toBeInTheDocument();
    });

    it("should label each side of a split y-axis separately", async () => {
      await setupSavedQuestion({
        query: createStructuredQuery({
          ...COUNT_BY_MONTH_STAGE,
          aggregations: [sumOf("TOTAL"), aggregationOf("min", "TOTAL")],
        }),
        dataset: createDataset(
          [
            createCreatedAtColumn("month"),
            createAggregationColumn({
              name: "sum",
              displayName: "Sum of Total",
              index: 0,
              baseType: "type/Float",
            }),
            createAggregationColumn({
              name: "min",
              displayName: "Min of Total",
              index: 1,
              baseType: "type/Float",
            }),
          ],
          MONTHS.map((month, index) => [
            month,
            20000 + index * 800,
            10 + (index % 9),
          ]),
        ),
      });
      const chart = await getChart();

      await waitFor(() =>
        expect(within(chart).getByText("Sum of Total")).toBeInTheDocument(),
      );
      expect(within(chart).getByText("Min of Total")).toBeInTheDocument();

      await openVizSettings();
      await openSettingsTab("Axes");
      const sidebar = getSettingsSidebar();

      // an unset right label inherits the left one
      await typeInto(
        within(sidebar).getByLabelText("Left axis label"),
        "Revenue",
      );
      expect(within(sidebar).getByLabelText("Right axis label")).toHaveValue(
        "Revenue",
      );
      await waitFor(() =>
        expect(within(chart).getAllByText("Revenue")).toHaveLength(2),
      );

      // the right label applies to the right axis only
      await typeInto(
        within(sidebar).getByLabelText("Right axis label"),
        "Smallest order",
      );
      await waitFor(() =>
        expect(within(chart).getByText("Smallest order")).toBeInTheDocument(),
      );
      expect(
        getXYTransform(within(chart).getByText("Smallest order")).x,
      ).toBeGreaterThan(getXYTransform(within(chart).getByText("Revenue")).x);

      // a chart with one y-axis offers one label
      await userEvent.click(
        within(sidebar).getByRole("switch", {
          name: "Split y-axis when necessary",
        }),
      );
      await waitFor(() =>
        expect(
          within(chart).queryByText("Smallest order"),
        ).not.toBeInTheDocument(),
      );
      expect(within(chart).getByText("Revenue")).toBeInTheDocument();
      expect(within(sidebar).getByDisplayValue("Revenue")).toBeInTheDocument();
      expect(
        within(sidebar).queryByLabelText("Right axis label"),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar).queryByLabelText("Left axis label"),
      ).not.toBeInTheDocument();
    });
  });

  it("should keep the chart legend and axis labels when there is one breakout value (metabase#4995, metabase#12782)", async () => {
    await setupAdhocQuestion({
      card: createMockUnsavedCard({
        display: "line",
        displayIsLocked: true,
        visualization_settings: {},
        dataset_query: createStructuredQuery({
          source: { type: "table", id: PRODUCTS_ID },
          filters: [
            {
              type: "operator",
              operator: "=",
              args: [
                { type: "column", name: "CATEGORY" },
                { type: "literal", value: "Doohickey" },
              ],
            },
          ],
          aggregations: [aggregationOf("avg", "PRICE")],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "year" },
            { type: "column", name: "CATEGORY" },
          ],
        }),
      }),
      dataset: createDataset(
        [
          createProductsCreatedAtYearColumn(),
          createCategoryColumn(),
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Price",
            index: 0,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.map((year, index) => [year, "Doohickey", 45 + index]),
      ),
    });
    expect(
      await screen.findByText("Category is Doohickey"),
    ).toBeInTheDocument();
    const chart = await getChart();

    await waitFor(() =>
      expect(within(chart).getByText("Created At: Year")).toBeInTheDocument(),
    );
    expect(within(chart).getByText("Average of Price")).toBeInTheDocument();
    expect(screen.getByTestId("legend-item")).toHaveTextContent("Doohickey");

    // the legend is hidden when not dealing with multi series
    await openVizSettings();
    await userEvent.click(
      within(getSettingsSidebar()).getByTestId("remove-CATEGORY"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("query-visualization-root"),
      ).not.toHaveTextContent("Doohickey"),
    );
    expect(screen.queryByTestId("legend-item")).not.toBeInTheDocument();
  });

  it("should format goal tooltip value to match y-axis tick formatting", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        ...COUNT_BY_MONTH_STAGE,
        aggregations: [sumOf("TOTAL")],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("month"),
          createAggregationColumn({
            name: "sum",
            displayName: "Sum of Total",
            index: 0,
            baseType: "type/Float",
          }),
        ],
        MONTHS.map((month, index) => [month, 2000 + index * 1000]),
      ),
      settings: {
        "graph.goal_value": 5000,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: {
          '["name","sum"]': { number_style: "currency", currency: "USD" },
        },
      },
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(within(chart).getByText("$50.0k")).toBeInTheDocument(),
    );

    hoverGoalMarker(chart);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Goal:")).toBeInTheDocument();
    expect(within(tooltip).getByText("$5,000.00")).toBeInTheDocument();
  });

  it("should support formatting goal tooltip value as a percent", async () => {
    await setupSavedQuestion({
      dataset: COUNT_BY_MONTH_DATASET,
      settings: {
        "graph.goal_value": 123.4567,
        "graph.show_goal": true,
        "graph.label_value_formatting": "compact",
        column_settings: { '["name","count"]': { number_style: "percent" } },
      },
    });
    const chart = await getChart();
    await waitFor(() =>
      expect(within(chart).getByText("50.0k%")).toBeInTheDocument(),
    );

    hoverGoalMarker(chart);
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Goal:")).toBeInTheDocument();
    expect(within(tooltip).getByText("12,345.67%")).toBeInTheDocument();
  });

  it("should not crash when the dimension column is gone from the results (metabase#59671)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      }),
      dataset: createDataset([COUNT_COLUMN], [[18760]]),
      settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    });

    expect(
      await screen.findByTestId("visualization-placeholder"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
  });

  it("should not crash when saved dimension settings refer to a non-existent column (metabase#59830)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          { type: "operator", operator: "count", args: [] },
          aggregationOf("avg", "TOTAL"),
        ],
        breakouts: [
          { type: "column", name: "CREATED_AT", unit: "month" },
          {
            type: "column",
            fieldId: PRODUCTS.CATEGORY,
            sourceFieldId: ORDERS.PRODUCT_ID,
          },
        ],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("month"),
          createProductsCategoryDatasetColumn({
            source: "breakout",
            field_ref: [
              "field",
              PRODUCTS.CATEGORY,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          }),
          COUNT_COLUMN,
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Total",
            index: 1,
            baseType: "type/Float",
          }),
        ],
        MONTHS.slice(0, 6).flatMap((month, index) =>
          CATEGORIES.map((category) => [month, category, 10 + index, 50]),
        ),
      ),
      settings: {
        "graph.dimensions": ["DOES_NOT_EXIST"],
        "graph.metrics": ["count"],
      },
    });

    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
  });

  it("should show an empty state when no dimensions are available (metabase#54755)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      }),
      dataset: createDataset([COUNT_COLUMN], [[18760]]),
      settings: {
        "graph.dimensions": [],
        "graph.metrics": ["count"],
      },
    });

    expect(
      await screen.findByTestId("visualization-placeholder"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
  });

  it("should not crash the app when rendering a line chart with broken viz settings and table metadata (metabase#54271)", async () => {
    const reviewers = Array.from(
      { length: 1076 },
      (_, index) => `reviewer${index}`,
    );
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: REVIEWS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [{ type: "column", name: "REVIEWER" }],
      }),
      dataset: createDataset(
        [
          // broken semantic type - the field cannot be parsed as a date
          createReviewsReviewerDatasetColumn({
            source: "breakout",
            semantic_type: "type/CreationDate",
          }),
          COUNT_COLUMN,
        ],
        reviewers.map((reviewer, index) => [reviewer, 1 + (index % 3)]),
      ),
      // broken viz settings - dimensions cannot have a text column
      settings: {
        "graph.dimensions": ["REVIEWER"],
        "graph.metrics": ["count"],
      },
    });

    expect(await screen.findByTestId("question-row-count")).toHaveTextContent(
      "Showing 1,076 rows",
    );
    expect(screen.getByTestId("query-builder-main")).toBeInTheDocument();
  });

  it("should not fire POST request after every character during display name change (metabase#21452)", async () => {
    const card = createMockUnsavedCard({
      display: "line",
      displayIsLocked: true,
      visualization_settings: {},
      dataset_query: createStructuredQuery({
        ...COUNT_BY_YEAR_STAGE,
        aggregations: [aggregationOf("cum-sum", "QUANTITY")],
      }),
    });
    await setupAdhocQuestion({
      card,
      dataset: createDataset(
        [
          createCreatedAtColumn("year"),
          createAggregationColumn({
            name: "sum",
            displayName: "Cumulative sum of Quantity",
            index: 0,
          }),
        ],
        YEAR_DATES.map((year, index) => [year, 3236 + index * 10000]),
      ),
    });
    const chart = await getChart();
    await openVizSettings();

    const popover = await openSeriesSettings("sum");
    const nameInput = within(popover).getByDisplayValue(
      "Cumulative sum of Quantity",
    );
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Foo");
    await userEvent.click(within(popover).getByText("Display type"));

    // Dismiss the popup and close settings
    await userEvent.click(
      within(screen.getByTestId("sidebar-left")).getByRole("button", {
        name: "Done",
      }),
    );

    await waitFor(() =>
      expect(getCircles(chart, "#88BF4D").length).toBeGreaterThan(0),
    );
    hoverDataPoint(chart, "#88BF4D", 0);
    const tooltip = await getTooltip("2025");
    assertTooltipRow(tooltip, {
      name: "Foo",
      value: "3,236",
      color: "#88BF4D",
    });

    expect(fetchMock.callHistory.calls("dataset-post")).toHaveLength(1);
  });

  describe("split panels", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should split series into panels and render each series in its own panel", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      await setupSavedQuestion({
        query: createStructuredQuery({
          ...COUNT_BY_MONTH_STAGE,
          aggregations: [sumOf("TOTAL"), aggregationOf("avg", "QUANTITY")],
        }),
        dataset: createDataset(
          [
            createCreatedAtColumn("month"),
            createAggregationColumn({
              name: "sum",
              displayName: "Sum of Total",
              index: 0,
              baseType: "type/Float",
            }),
            createAggregationColumn({
              name: "avg",
              displayName: "Average of Quantity",
              index: 1,
              baseType: "type/Float",
            }),
          ],
          MONTHS.map((month, index) =>
            index === 0
              ? [month, 52.76, 2]
              : [month, 1000 + index * 1150, 2 + (index % 12) / 2],
          ),
        ),
      });
      const chart = await getChart();
      await waitFor(() =>
        expect(screen.getAllByTestId("legend-item")).toHaveLength(2),
      );
      const getSeparators = () => getSplitPanelSeparators(chart);
      expect(getSeparators()).toHaveLength(0);

      await openVizSettings();
      await openSettingsTab("Display");
      expect(trackSimpleEvent).not.toHaveBeenCalled();
      await userEvent.click(
        within(getSettingsSidebar()).getByRole("switch", {
          name: "Stack series",
        }),
      );
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "stack_series_enabled",
        triggered_from: "viz_settings",
      });

      await waitFor(() => expect(getSeparators()).toHaveLength(1));
      expect(within(chart).getByText("60,000")).toBeInTheDocument();
      expect(within(chart).getByText("8")).toBeInTheDocument();
      expect(getCircles(chart, "#88BF4D").length).toBeGreaterThan(0);
      expect(getCircles(chart, "#A989C5").length).toBeGreaterThan(0);

      // Change series color while split panels are active
      await openSettingsTab("Data");
      let popover = await openSeriesSettings("sum");
      await pickColor(getColorSelectorButton(popover), "#EF8C8C");
      await userEvent.click(
        within(popover).getByRole("radio", { name: "Bar" }),
      );
      await userEvent.click(
        within(popover).getByRole("tab", { name: "Formatting" }),
      );
      popover = screen.getByRole("dialog");
      await userEvent.type(within(popover).getByPlaceholderText("$"), "$");
      await userEvent.tab();
      await userEvent.click(
        within(screen.getByTestId("sidebar-left")).getByRole("button", {
          name: "Done",
        }),
      );

      await waitFor(() =>
        expect(within(chart).getByText("$60,000")).toBeInTheDocument(),
      );
      expect(getSeparators()).toHaveLength(1);
      expect(getPathsWithFill(chart, "#EF8C8C").length).toBeGreaterThan(0);
      expect(getCircles(chart, "#88BF4D")).toHaveLength(0);
      expect(getCircles(chart, "#A989C5").length).toBeGreaterThan(0);

      hoverDataPoint(chart, "#A989C5", 0);
      const tooltip = await getTooltip("April 2025");
      assertTooltipRow(tooltip, { name: "Sum of Total", value: "$52.76" });
      assertTooltipRow(tooltip, { name: "Average of Quantity", value: "2" });
    });
  });
});

describe("QueryBuilder > line chart > trend line", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 800 });
  });

  it("should handle per-series trend line settings (metabase#12781)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        ...COUNT_BY_YEAR_STAGE,
        aggregations: [aggregationOf("avg", "SUBTOTAL"), sumOf("TOTAL")],
      }),
      dataset: createDataset(
        [
          createCreatedAtColumn("year"),
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Subtotal",
            index: 0,
            baseType: "type/Float",
          }),
          createAggregationColumn({
            name: "sum",
            displayName: "Sum of Total",
            index: 1,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.map((year, index) => [
          year,
          [56.1, 77.4, 78.3, 79.2, 76.5][index],
          [42156, 205256, 351986, 403839, 507382][index],
        ]),
        [createYearlyInsight("avg"), createYearlyInsight("sum")],
      ),
    });
    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));
    expect(getTrendLines(chart)).toHaveLength(0);

    await openVizSettings();
    await openSettingsTab("Display");
    await userEvent.click(
      within(getSettingsSidebar()).getByRole("switch", { name: "Trend line" }),
    );

    // global customization is hidden when there are multiple series
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(2));
    expect(
      within(getSettingsSidebar()).queryByText("Trend line color"),
    ).not.toBeInTheDocument();
    expect(
      within(getSettingsSidebar()).queryByText("Trend line style"),
    ).not.toBeInTheDocument();

    // trend lines are customized in the series settings popover
    await openSettingsTab("Data");
    let popover = await openSeriesSettings("avg");
    expect(within(popover).getByText("Trend line color")).toBeInTheDocument();
    expect(within(popover).getByText("Trend line style")).toBeInTheDocument();
    const trendLineDashed = within(
      within(popover).getByTestId("chart-settings-widget-trendline.style"),
    ).getByRole("radio", { name: "Dashed" });
    await userEvent.click(trendLineDashed);
    await waitFor(() =>
      expect(
        getTrendLines(chart).filter((line) =>
          line.hasAttribute("stroke-dasharray"),
        ),
      ).toHaveLength(1),
    );
    await closePopover(trendLineDashed);

    // pick a custom color for this series trend line
    popover = await openSeriesSettings("avg");
    // #8A5EB0 is the default trend line color, the shade of the avg series
    await pickColor(within(popover).getByLabelText("#8A5EB0"), "#509EE3");
    await waitFor(() =>
      expect(
        getTrendLines(chart).filter(
          (line) => line.getAttribute("stroke") === "#509EE3",
        ),
      ).toHaveLength(1),
    );
    expect(
      getTrendLines(chart).find(
        (line) => line.getAttribute("stroke") === "#509EE3",
      ),
    ).toHaveAttribute("stroke-dasharray");
    await closePopover(
      within(screen.getAllByRole("dialog")[0]).getByRole("switch", {
        name: "Show trend line for this series",
      }),
    );

    // hiding the series trend line hides its customization settings
    popover = await openSeriesSettings("avg");
    const getShowTrendLine = () =>
      within(screen.getByRole("dialog")).getByRole("switch", {
        name: "Show trend line for this series",
      });
    await userEvent.click(getShowTrendLine());
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(1));
    expect(getShowTrendLine()).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByText("Trend line color"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByText("Trend line style"),
    ).not.toBeInTheDocument();
    await userEvent.click(getShowTrendLine());
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(2));
    await closePopover(getShowTrendLine());

    await userEvent.click(
      within(getSettingsSidebar()).getByTestId("remove-sum"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(1));
    expect(getCircles(chart).length).toBeGreaterThan(0);
  });

  it("should allow customizing the trend line color and style", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery(COUNT_BY_YEAR_STAGE),
      dataset: COUNT_BY_YEAR_DATASET,
    });
    const chart = await getChart();
    await waitFor(() => expect(getCircles(chart).length).toBeGreaterThan(0));

    // color and style settings appear only when the trend line is on
    await openVizSettings();
    await openSettingsTab("Display");
    const sidebar = getSettingsSidebar();
    expect(
      within(sidebar).queryByText("Trend line color"),
    ).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByText("Trend line style"),
    ).not.toBeInTheDocument();
    expect(getTrendLines(chart)).toHaveLength(0);
    await userEvent.click(
      within(sidebar).getByRole("switch", { name: "Trend line" }),
    );
    expect(
      await within(sidebar).findByText("Trend line color"),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("Trend line style")).toBeInTheDocument();

    // by default the trend line is solid and uses the series shade
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(1));
    let [trendLine] = getTrendLines(chart);
    expect(trendLine).toHaveAttribute("stroke", "#227FD2");
    expect(trendLine).not.toHaveAttribute("stroke-dasharray");

    // changing the style renders a dashed trend line
    await userEvent.click(
      within(sidebar).getByRole("radio", { name: "Dashed" }),
    );
    await waitFor(() =>
      expect(getTrendLines(chart)[0]).toHaveAttribute("stroke-dasharray"),
    );

    // changing the color applies it to the trend line
    await pickColor(within(sidebar).getByLabelText("#227FD2"), "#88BF4D");
    await waitFor(() =>
      expect(getTrendLines(chart)[0]).toHaveAttribute("stroke", "#88BF4D"),
    );
    [trendLine] = getTrendLines(chart);
    expect(trendLine).toHaveAttribute("stroke-dasharray");
  });

  it("should display trend line for stack-100% chart (metabase#25614)", async () => {
    await setupSavedQuestion({
      query: createStructuredQuery({
        source: { type: "table", id: PRODUCTS_ID },
        aggregations: [
          { type: "operator", operator: "count", args: [] },
          aggregationOf("avg", "PRICE"),
        ],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
      }),
      dataset: createDataset(
        [
          createProductsCreatedAtYearColumn(),
          COUNT_COLUMN,
          createAggregationColumn({
            name: "avg",
            displayName: "Average of Price",
            index: 1,
            baseType: "type/Float",
          }),
        ],
        YEAR_DATES.map((year, index) => [year, 20 + index * 15, 50 + index]),
        [createYearlyInsight("count"), createYearlyInsight("avg")],
      ),
      display: "bar",
    });
    const chart = await getChart();

    await openVizSettings();
    await openSettingsTab("Display");
    await userEvent.click(
      within(getSettingsSidebar()).getByRole("radio", { name: "Stack - 100%" }),
    );
    await waitFor(() =>
      expect(within(chart).getByText("100%")).toBeInTheDocument(),
    );
    await userEvent.click(
      within(getSettingsSidebar()).getByRole("switch", { name: "Trend line" }),
    );

    // ensure that two trend lines are present
    await waitFor(() => expect(getTrendLines(chart)).toHaveLength(2));
  });
});
