import type { LineSeriesOption } from "echarts/charts";

import type { ComputedVisualizationSettings } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { Z_INDEXES } from "../constants/style";
import type { BaseCartesianChartModel } from "../model/types";

import { getSeriesYAxisIndex } from "./utils";

export const TREND_LINE_WIDTH = 1.15;

export function getTrendLinesOption(
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
): LineSeriesOption[] {
  return (
    chartModel.trendLinesModel?.seriesModels.map((trendSeries) => ({
      type: "line",
      datasetIndex: 1,
      yAxisIndex: getSeriesYAxisIndex(trendSeries.sourceDataKey, chartModel),
      encode: {
        x: X_AXIS_DATA_KEY,
        y: trendSeries.dataKey,
      },
      smooth: true,
      dimensions: [X_AXIS_DATA_KEY, trendSeries.dataKey],
      showSymbol: false,
      lineStyle: {
        color: trendSeries.color,
        type: settings["graph.trendline_style"] ?? "solid",
        width: TREND_LINE_WIDTH,
      },
      z: Z_INDEXES.trendLine,
    })) ?? []
  );
}
