import type { RegisteredSeriesOption } from "echarts";
import _ from "underscore";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";

import { CHART_STYLE } from "../constants/style";
import type { CartesianChartModel } from "../model/types";

import { getSeriesYAxisIndex } from "./utils";

export function getTrendLinesOption(
  chartModel: CartesianChartModel,
): RegisteredSeriesOption["line"][] {
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
        type: [5, 5],
        width: 2,
      },
      z: CHART_STYLE.trendLine.zIndex,
    })) ?? []
  );
}
