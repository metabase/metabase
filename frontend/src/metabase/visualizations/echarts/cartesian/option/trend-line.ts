// eslint-disable-next-line no-restricted-imports -- deprecated usage
import _ from "underscore";
import type { RegisteredSeriesOption } from "echarts";

import {
  TREND_LINE_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";

import type { CartesianChartModel } from "../model/types";
import { CHART_STYLE } from "../constants/style";
import { getSeriesYAxisIndex } from "./utils";

export function getTrendLinesOption(
  chartModel: CartesianChartModel,
): RegisteredSeriesOption["line"][] {
  return chartModel.trendLinesSeries.map((trendSeries, index) => ({
    type: "line",
    datasetIndex: index + 1, // offset to account for the chart's dataset (e.g. question results)
    yAxisIndex: getSeriesYAxisIndex(chartModel.seriesModels[index], chartModel),
    encode: {
      x: X_AXIS_DATA_KEY,
      y: TREND_LINE_DATA_KEY,
    },
    showSymbol: false,
    lineStyle: {
      color: trendSeries.color,
      type: [5, 5],
      width: 2,
    },
    z: CHART_STYLE.trendLine.zIndex,
  }));
}
