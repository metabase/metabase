import type {
  CallbackDataParams,
  XAXisOption,
  YAXisOption,
} from "echarts/types/dist/shared";

import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { GRAPH_COLORS_SETTINGS } from "metabase/visualizations/lib/settings/graph";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import { getTooltipModel } from "metabase/visualizations/visualizations/CartesianChart/events";
import type { RawSeries, SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getChartLayout } from "../layout";
import { getCartesianChartModel } from "../model";

import { buildAxes } from "./axis";
import { buildEChartsSeries } from "./series";

import { ensureRoomForLabels } from "./index";

const chartWidth = 480;
const chartHeight = 274;
const hasTimelineEvents = false;
const hiddenSeries: string[] = [];

const mockRenderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const seriesFn = jest.fn();

const mockSettings = createMockVisualizationSettings({
  "graph.dimensions": ["Month created"],
  "graph.metrics": ["count"],
  series: seriesFn,
});

const mockSeries: SingleSeries = {
  card: createMockCard(),
  data: createMockDatasetData({
    rows: [
      [1, 200],
      [2, 300],
      [3, 400],
      [4, 500],
    ],
    cols: [
      createMockColumn({ name: "Month created" }),
      createMockColumn({ name: "count" }),
    ],
  }),
};

const mockSeriesWithNegative: SingleSeries = {
  ...mockSeries,
  data: {
    ...mockSeries.data,
    rows: [
      [1, 200],
      [2, 300],
      [3, -150],
      [4, 500],
    ],
  },
};

describe("ensureRoomForLabels", () => {
  const getArgs = (
    rawSeries: RawSeries,
  ): Parameters<typeof ensureRoomForLabels> => {
    const chartModel = getCartesianChartModel(
      rawSeries,
      mockSettings,
      hiddenSeries,
      mockRenderingContext,
    );

    const chartLayout = getChartLayout(
      chartModel,
      mockSettings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      mockRenderingContext,
    );

    const axes = buildAxes(
      chartModel,
      chartLayout,
      mockSettings,
      hasTimelineEvents,
      mockRenderingContext,
    );

    const dataSeriesOptions = buildEChartsSeries(
      chartModel,
      mockSettings,
      chartWidth,
      chartLayout,
      mockRenderingContext,
    );

    return [axes, chartModel, chartLayout, dataSeriesOptions] as const;
  };

  const getBoundaryGap = (axis: YAXisOption | XAXisOption) =>
    "boundaryGap" in axis ? axis.boundaryGap : undefined;

  beforeEach(() => {
    seriesFn.mockReturnValue({ display: "bar" });
  });

  it("does not alter the axes if there are no negative values", () => {
    const args = getArgs([mockSeries]);
    const [originalAxes] = args;
    const axes = ensureRoomForLabels(...args);
    expect(axes.xAxis).toBe(originalAxes.xAxis);
    expect(getBoundaryGap(axes.xAxis)).toBe(undefined);
    expect(axes.yAxis.map(getBoundaryGap)).toEqual([undefined]);
  });

  it("does not alter the axes for non-bar charts", () => {
    seriesFn.mockReturnValue({ display: "line" });
    const args = getArgs([mockSeriesWithNegative]);
    const [originalAxes] = args;
    const axes = ensureRoomForLabels(...args);
    expect(axes.xAxis).toBe(originalAxes.xAxis);
    expect(getBoundaryGap(axes.xAxis)).toBe(undefined);
    expect(axes.yAxis.map(getBoundaryGap)).toEqual([undefined]);
  });

  it("adds a lower boundaryGap to the y-axis if there are negative values and it's a bar chart", () => {
    const args = getArgs([mockSeriesWithNegative]);
    const [originalAxes] = args;
    const axes = ensureRoomForLabels(...args);
    expect(axes.xAxis).toBe(originalAxes.xAxis);
    expect(axes.yAxis.map(getBoundaryGap)).toEqual([[0.026, 0]]);
  });
});

describe("graph._dimension_value_colors (explorations per-bar colors)", () => {
  // Regression guard: an unregistered setting key is stripped by
  // `getComputedSettings`, so the value must round-trip through it.
  it("survives getComputedSettings as a pass-through", () => {
    const colors = { open: "#111111", closed: "#222222" };
    const computed = getComputedSettings(
      GRAPH_COLORS_SETTINGS,
      [mockSeries],
      createMockVisualizationSettings({
        "graph._dimension_value_colors": colors,
      }),
    );
    expect(computed["graph._dimension_value_colors"]).toEqual(colors);
  });

  const NULL_COLOR = "#333333";
  const DIMENSION_COLORS = {
    open: "#111111",
    closed: "#222222",
    [NULL_DISPLAY_VALUE]: NULL_COLOR,
    null: NULL_COLOR,
  };

  function setupCategoricalBar() {
    const categoricalSeries: SingleSeries = {
      card: createMockCard(),
      data: createMockDatasetData({
        rows: [
          ["open", 200],
          [null, 100],
          ["closed", 300],
        ],
        cols: [
          createMockColumn({ name: "state", base_type: "type/Text" }),
          createMockColumn({ name: "count", base_type: "type/Integer" }),
        ],
      }),
    };
    const settings = createMockVisualizationSettings({
      "graph.dimensions": ["state"],
      "graph.metrics": ["count"],
      "graph._dimension_value_colors": DIMENSION_COLORS,
      series: jest.fn().mockReturnValue({ display: "bar" }),
    });
    const chartModel = getCartesianChartModel(
      [categoricalSeries],
      settings,
      hiddenSeries,
      mockRenderingContext,
    );
    return { chartModel, settings };
  }

  it("paints each bar by its x-axis value via a per-point itemStyle callback", () => {
    const { chartModel, settings } = setupCategoricalBar();
    const chartLayout = getChartLayout(
      chartModel,
      settings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      mockRenderingContext,
    );
    const seriesOptions = buildEChartsSeries(
      chartModel,
      settings,
      chartWidth,
      chartLayout,
      mockRenderingContext,
    );

    const barSeries = seriesOptions.find((s) => s.type === "bar");
    const color = barSeries?.itemStyle?.color;
    expect(typeof color).toBe("function");
    const colorFn = color as (params: CallbackDataParams) => string;
    expect(colorFn({ dataIndex: 0 } as CallbackDataParams)).toBe("#111111");
    expect(colorFn({ dataIndex: 1 } as CallbackDataParams)).toBe(NULL_COLOR);
    expect(colorFn({ dataIndex: 2 } as CallbackDataParams)).toBe("#222222");

    // Hover (emphasis) inherits each bar's own per-point color. A function here
    // would render the bar black (ECharts doesn't resolve functional emphasis
    // colors), so we use the literal "inherit".
    expect(barSeries?.emphasis?.itemStyle?.color).toBe("inherit");
  });

  it("colors the tooltip marker by the hovered bar's category", () => {
    const { chartModel, settings } = setupCategoricalBar();
    const seriesDataKey = chartModel.seriesModels[0].dataKey;

    const openTooltip = getTooltipModel(
      chartModel,
      settings,
      0,
      "bar",
      seriesDataKey,
    );
    expect(openTooltip?.rows[0].markerColorClass).toBe(
      getMarkerColorClass("#111111"),
    );

    const nullTooltip = getTooltipModel(
      chartModel,
      settings,
      1,
      "bar",
      seriesDataKey,
    );
    expect(nullTooltip?.rows[0].markerColorClass).toBe(
      getMarkerColorClass(NULL_COLOR),
    );

    const closedTooltip = getTooltipModel(
      chartModel,
      settings,
      2,
      "bar",
      seriesDataKey,
    );
    expect(closedTooltip?.rows[0].markerColorClass).toBe(
      getMarkerColorClass("#222222"),
    );
  });
});
