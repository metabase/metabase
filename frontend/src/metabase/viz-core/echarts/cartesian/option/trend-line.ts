import type { LineSeriesOption } from "echarts/charts";

import { Z_INDEXES } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import type { BaseCartesianChartModel } from "../model/types";

import { getXAxisDataKey } from "./dashboard-x-axis";
import { getSeriesYAxisIndex } from "./utils";

export const TREND_LINE_DASH = [5, 5];

export function getTrendLinesOption(
  chartModel: BaseCartesianChartModel,
  chartLayout?: ChartLayout,
): LineSeriesOption[] {
  return (
    chartModel.trendLinesModel?.seriesModels.map((trendSeries) => ({
      type: "line",
      datasetIndex: 1,
      yAxisIndex: getSeriesYAxisIndex(trendSeries.sourceDataKey, chartModel),
      encode: {
        x: getXAxisDataKey(chartModel.xAxisModel, chartLayout),
        y: trendSeries.dataKey,
      },
      smooth: true,
      dimensions: [
        getXAxisDataKey(chartModel.xAxisModel, chartLayout),
        trendSeries.dataKey,
      ],
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
