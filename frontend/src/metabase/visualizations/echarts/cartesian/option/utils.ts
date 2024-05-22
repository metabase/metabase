import type { DataKey, CartesianChartModel } from "../model/types";

export function getSeriesYAxisIndex(
  dataKey: DataKey,
  chartModel: CartesianChartModel,
): number {
  const { leftAxisModel, rightAxisModel } = chartModel;
  const hasSingleYAxis = leftAxisModel == null || rightAxisModel == null;

  if (hasSingleYAxis) {
    return 0;
  }

  return leftAxisModel.seriesKeys.includes(dataKey) ? 0 : 1;
}
