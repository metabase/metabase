import { BarChart } from "echarts/charts";
import {
  BrushComponent,
  GridComponent,
  ToolboxComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { XAXisOption, YAXisOption } from "echarts/types/dist/shared";

import type { RawSeries, SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import { registerEChartsModules } from "../../index";
import { CHART_STYLE } from "../constants/style";
import { getChartLayout } from "../layout";
import { getCartesianChartModel } from "../model";

import { buildAxes } from "./axis";
import { buildEChartsSeries } from "./series";

import {
  ensureRoomForLabels,
  getCartesianChartOption,
  getSharedEChartsOptions,
} from "./index";

echarts.use([
  BarChart,
  GridComponent,
  BrushComponent,
  ToolboxComponent,
  SVGRenderer,
]);

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

describe("brushSelected / brushEnd ordering", () => {
  it("does not throttle brushSelected in getSharedEChartsOptions", () => {
    const renderingContext: RenderingContext = {
      ...mockRenderingContext,
      getColor: () => "#509EE3",
    };
    const { brush } = getSharedEChartsOptions(false, renderingContext);

    expect(brush).not.toHaveProperty("throttleType");
    expect(brush).not.toHaveProperty("throttleDelay");
  });

  it("delivers brushSelected synchronously before brushEnd when throttle is unset", () => {
    const dom = document.createElement("div");
    document.body.appendChild(dom);
    const chart = echarts.init(dom, undefined, {
      renderer: "svg",
      width: 600,
      height: 400,
    });
    chart.setOption({
      animation: false,
      // Unthrottled, matching getSharedEChartsOptions. xAxisIndex is omitted
      // because jsdom never finishes cartesian layout.
      brush: { toolbox: ["lineX"] },
      xAxis: { type: "category", data: ["a", "b", "c", "d", "e"] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [1, 2, 3, 4, 5] }],
    });

    const order: string[] = [];
    chart.on("brushSelected", () => {
      order.push("brushSelected");
    });
    chart.on("brushEnd", () => {
      order.push("brushEnd");
    });

    const area = {
      brushType: "lineX" as const,
      range: [100, 300],
      xAxisIndex: 0,
      panelId: "grid--\u0000_ec_\u00000",
    };
    chart.dispatchAction({ type: "brush", areas: [area] });
    chart.dispatchAction({ type: "brushEnd", areas: [area] });

    expect(order).toEqual(["brushSelected", "brushEnd"]);
    chart.dispose();
  });
});

describe("row chart bands", () => {
  beforeAll(() => registerEChartsModules());

  const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];

  // Bars render as `<path d="M{x} {y}l{w} 0l0 {h}l-{w} 0Z">`; returns each
  // series-0 bar's top, length and thickness.
  const getBarRects = (svg: string) =>
    [
      ...svg.matchAll(
        /<path d="M[\d.]+ ([\d.]+)l([\d.]+) 0l0 ([\d.]+)l-[\d.]+ 0Z"[^>]*ecmeta_series_index="0"/g,
      ),
    ].map((match) => ({
      top: Number(match[1]),
      length: Number(match[2]),
      thickness: Number(match[3]),
    }));

  const getRowChartOption = (
    values = CATEGORIES.map((_, index) => 100 * (index + 1)),
  ) => {
    const renderingContext: RenderingContext = {
      ...mockRenderingContext,
      getColor: () => "#509EE3",
    };
    const rowSettings = createMockVisualizationSettings({
      "graph.dimensions": ["CATEGORY"],
      "graph.metrics": ["count"],
      "graph.x_axis.scale": "ordinal",
      series: () => ({ display: "bar" }),
    });
    const rawSeries: RawSeries = [
      {
        card: createMockCard({ display: "row" }),
        data: createMockDatasetData({
          rows: CATEGORIES.map((category, index) => [category, values[index]]),
          cols: [
            createMockColumn({ name: "CATEGORY", base_type: "type/Text" }),
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
        }),
      },
    ];
    const chartModel = getCartesianChartModel(
      rawSeries,
      rowSettings,
      hiddenSeries,
      renderingContext,
    );
    const chartLayout = getChartLayout(
      chartModel,
      rowSettings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      renderingContext,
    );

    return getCartesianChartOption(
      chartModel,
      chartLayout,
      hasTimelineEvents,
      null,
      [],
      rowSettings,
      chartWidth,
      false,
      renderingContext,
    );
  };

  const renderRowChartBars = (values?: number[]) => {
    const chart = echarts.init(null, null, {
      renderer: "svg",
      ssr: true,
      width: chartWidth,
      height: chartHeight,
    });
    chart.setOption(getRowChartOption(values));
    const bars = getBarRects(chart.renderToSVGString());
    chart.dispose();

    expect(bars).toHaveLength(CATEGORIES.length);
    return { bars, pitch: bars[1].top - bars[0].top };
  };

  it("gives each bar 80% of its category band, like the legacy renderer", () => {
    const { bars, pitch } = renderRowChartBars();

    for (const { thickness } of bars) {
      expect(thickness / pitch).toBeCloseTo(0.8, 2);
    }
  });

  it("keeps 20% of a band clear above the first bar, like the legacy renderer", () => {
    const { bars, pitch } = renderRowChartBars();

    // With no goal label, the plot starts at the base top padding.
    expect((bars[0].top - CHART_STYLE.padding.y) / pitch).toBeCloseTo(0.2, 2);
  });

  it("draws near-zero bars at least 1px long", () => {
    const { bars } = renderRowChartBars([1_000_000, 1, 2, 3]);

    for (const { length } of bars) {
      expect(length).toBeGreaterThanOrEqual(1);
    }
  });

  it("lets ECharts keep metric tick labels inside the chart, but not move axis names", () => {
    expect(getRowChartOption().grid).toMatchObject({
      outerBoundsMode: "auto",
      outerBoundsContain: "axisLabel",
    });
  });
});

describe("chart grid bounds", () => {
  it("keeps upright charts inside the layout's own padding", () => {
    seriesFn.mockReturnValue({ display: "bar" });
    const renderingContext: RenderingContext = {
      ...mockRenderingContext,
      getColor: () => "#509EE3",
    };
    const chartModel = getCartesianChartModel(
      [mockSeries],
      mockSettings,
      hiddenSeries,
      renderingContext,
    );
    const chartLayout = getChartLayout(
      chartModel,
      mockSettings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      renderingContext,
    );
    const option = getCartesianChartOption(
      chartModel,
      chartLayout,
      hasTimelineEvents,
      null,
      [],
      mockSettings,
      chartWidth,
      false,
      renderingContext,
    );

    expect(option.grid).toMatchObject({ outerBoundsMode: "none" });
  });
});
