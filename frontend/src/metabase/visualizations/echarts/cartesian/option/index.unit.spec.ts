import type { XAXisOption, YAXisOption } from "echarts/types/dist/shared";

import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import type { RawSeries, SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getChartMeasurements } from "../chart-measurements";
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

    const chartMeasurements = getChartMeasurements(
      chartModel,
      mockSettings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      mockRenderingContext,
    );

    const axes = buildAxes(
      chartModel,
      chartWidth,
      chartMeasurements,
      mockSettings,
      hasTimelineEvents,
      mockRenderingContext,
    );

    const dataSeriesOptions = buildEChartsSeries(
      chartModel,
      mockSettings,
      chartWidth,
      chartMeasurements,
      mockRenderingContext,
    );

    return [axes, chartModel, chartMeasurements, dataSeriesOptions] as const;
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
