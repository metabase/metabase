import { createMockSeriesModel } from "__support__/echarts";
import { deriveChartShadeColor } from "metabase/ui/colors/accents";
import type { RawSeries, SeriesSettings } from "metabase-types/api";
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

const SERIES_COLORS: Record<string, string> = {
  count: "#509EE3",
  avg: "#88BF4D",
};

const setup = ({
  trendlineColor,
  trendlineStyle,
  seriesSettings = {},
  metrics = ["count", "avg"],
}: {
  trendlineColor?: string;
  trendlineStyle?: "solid" | "dashed" | "dotted";
  seriesSettings?: Record<string, SeriesSettings>;
  metrics?: string[];
} = {}) => {
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
            ...metrics.map((name) => createMockColumn({ name })),
          ],
          insights: metrics.map((name) =>
            createMockInsight({ col: name, slope: 1, offset: 0 }),
          ),
        }),
      },
    ),
  ];

  const seriesModels = metrics.map((name) =>
    createMockSeriesModel({
      dataKey: name,
      cardId: 1,
      column: createMockColumn({ name }),
      color: SERIES_COLORS[name],
    }),
  );

  const chartDataset: ChartDataset = [
    { [X_AXIS_DATA_KEY]: "2024-01-01", count: 1, avg: 2 },
    { [X_AXIS_DATA_KEY]: "2024-02-01", count: 2, avg: 4 },
  ];

  const settings: ComputedVisualizationSettings = {
    "graph.show_trendline": true,
    "graph.trendline_color": trendlineColor,
    "graph.trendline_style": trendlineStyle,
    "graph.y_axis.auto_range": true,
    series: (key) => seriesSettings[key.card._seriesKey ?? ""] ?? {},
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

  it("should use the explicitly selected color for a single trend line", () => {
    const trendLinesModel = setup({
      trendlineColor: "#ED6E6E",
      metrics: ["count"],
    });

    expect(trendLinesModel?.seriesModels.map((series) => series.color)).toEqual(
      ["#ED6E6E"],
    );
  });

  it("should ignore the selected color and keep per-series shades with multiple trend lines", () => {
    const trendLinesModel = setup({ trendlineColor: "#ED6E6E" });

    expect(trendLinesModel?.seriesModels.map((series) => series.color)).toEqual(
      [deriveChartShadeColor("#509EE3"), deriveChartShadeColor("#88BF4D")],
    );
  });

  it("should use the global style for a single series and default to solid", () => {
    expect(
      setup({ metrics: ["count"] })?.seriesModels.map((series) => series.style),
    ).toEqual(["solid"]);
    expect(
      setup({ metrics: ["count"], trendlineStyle: "dashed" })?.seriesModels.map(
        (series) => series.style,
      ),
    ).toEqual(["dashed"]);
  });

  it("should use per-series color and style with multiple series", () => {
    const trendLinesModel = setup({
      seriesSettings: {
        count: { "trendline.color": "#ED6E6E", "trendline.style": "dotted" },
      },
    });

    expect(trendLinesModel?.seriesModels.map((series) => series.color)).toEqual(
      ["#ED6E6E", deriveChartShadeColor("#88BF4D")],
    );
    expect(trendLinesModel?.seriesModels.map((series) => series.style)).toEqual(
      ["dotted", "solid"],
    );
  });

  it("should fall back to the global style with multiple series", () => {
    const trendLinesModel = setup({
      trendlineStyle: "dashed",
      seriesSettings: {
        count: { "trendline.style": "dotted" },
      },
    });

    expect(trendLinesModel?.seriesModels.map((series) => series.style)).toEqual(
      ["dotted", "dashed"],
    );
  });
});
