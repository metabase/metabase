import type { LineSeriesOption } from "echarts/charts";
import _ from "underscore";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";

import { Z_INDEXES } from "../constants/style";
import type { BaseCartesianChartModel } from "../model/types";

import { getSeriesYAxisIndex } from "./utils";

export const TREND_LINE_DASH = [5, 5];

export function getTrendLinesOption(
  chartModel: BaseCartesianChartModel,
): LineSeriesOption[] {
  return (
    chartModel.trendLinesModel?.seriesModels.map(trendSeries => ({
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
        type: TREND_LINE_DASH,
        width: 2,
      },
      z: Z_INDEXES.trendLine,
    })) ?? []
  );
}
