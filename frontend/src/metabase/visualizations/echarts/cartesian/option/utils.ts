import type { CartesianChartModel, SeriesModel } from "../model/types";

export function getSeriesYAxisIndex(
  seriesModel: SeriesModel,
  chartModel: CartesianChartModel,
): number {
  const { leftAxisModel, rightAxisModel } = chartModel;
  const hasSingleYAxis = leftAxisModel == null || rightAxisModel == null;

  if (hasSingleYAxis) {
    return 0;
  }

  return leftAxisModel.seriesKeys.includes(seriesModel.dataKey) ? 0 : 1;
}
