import type { CartesianChartModel, SeriesModel } from "../model/types";

export function getSeriesYAxisIndex(
  seriesModel: SeriesModel,
  chartModel: CartesianChartModel,
): number {
  const hasSingleYAxis = chartModel.yAxisSplit.some(
    yAxisKeys => yAxisKeys.length === 0,
  );

  if (hasSingleYAxis) {
    return 0;
  }

  return chartModel.yAxisSplit.findIndex(yAxis =>
    yAxis.includes(seriesModel.dataKey),
  );
}
