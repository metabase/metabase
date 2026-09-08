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
import { getChartLayout } from "../layout";
import { getCartesianChartModel } from "../model";

import { buildAxes } from "./axis";
import { buildEChartsSeries } from "./series";

import { ensureRoomForLabels, getSharedEChartsOptions } from "./index";

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
