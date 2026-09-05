import { createMockSeriesModel } from "__support__/echarts";
import { deriveChartShadeColor } from "metabase/ui/colors/accents";
import type { RawSeries } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockInsight,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";

import { getTrendLines } from "./trend-line";
import type { ChartDataset, NumericAxisScaleTransforms } from "./types";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const yAxisScaleTransforms: NumericAxisScaleTransforms = {
  toEChartsAxisValue: (value) => Number(value),
  fromEChartsAxisValue: (value) => value,
};

const setup = ({ trendlineColor }: { trendlineColor?: string } = {}) => {
  const rawSeries: RawSeries = [
    createMockSingleSeries(
      {
        visualization_settings: {
          "graph.show_trendline": true,
          "graph.trendline_color": trendlineColor,
        },
      },
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "month" }),
            createMockColumn({ name: "count" }),
            createMockColumn({ name: "avg" }),
          ],
          insights: [
            createMockInsight({ col: "count", slope: 1, offset: 0 }),
            createMockInsight({ col: "avg", slope: 2, offset: 0 }),
          ],
        }),
      },
    ),
  ];

  const seriesModels = [
    createMockSeriesModel({
      dataKey: "count",
      cardId: 1,
      column: createMockColumn({ name: "count" }),
      color: "#509EE3",
    }),
    createMockSeriesModel({
      dataKey: "avg",
      cardId: 1,
      column: createMockColumn({ name: "avg" }),
      color: "#88BF4D",
    }),
  ];

  const chartDataset: ChartDataset = [
    { [X_AXIS_DATA_KEY]: "2024-01-01", count: 1, avg: 2 },
    { [X_AXIS_DATA_KEY]: "2024-02-01", count: 2, avg: 4 },
  ];

  const settings: ComputedVisualizationSettings = {
    "graph.show_trendline": true,
    "graph.trendline_color": trendlineColor,
    "graph.y_axis.auto_range": true,
    series: () => ({}),
  };

  return getTrendLines(
    rawSeries,
    [null, null],
    yAxisScaleTransforms,
    seriesModels,
    chartDataset,
    settings,
    [],
    renderingContext,
  );
};

describe("getTrendLines", () => {
  it("should use the darker variant of each series color by default", () => {
    const trendLinesModel = setup();

    expect(trendLinesModel?.seriesModels.map((series) => series.color)).toEqual(
      [deriveChartShadeColor("#509EE3"), deriveChartShadeColor("#88BF4D")],
    );
  });

  it("should use the explicitly selected color for all trend lines", () => {
    const trendLinesModel = setup({ trendlineColor: "#ED6E6E" });

    expect(trendLinesModel?.seriesModels.map((series) => series.color)).toEqual(
      ["#ED6E6E", "#ED6E6E"],
    );
  });
});
