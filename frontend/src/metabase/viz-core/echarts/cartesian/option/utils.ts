import type { BaseCartesianChartModel, DataKey } from "../model/types";

export function getSeriesYAxisIndex(
  dataKey: DataKey,
  chartModel: BaseCartesianChartModel,
): number {
  const { leftAxisModel, rightAxisModel } = chartModel;
  const hasSingleYAxis = leftAxisModel == null || rightAxisModel == null;

  if (hasSingleYAxis) {
    return 0;
  }

  return leftAxisModel.seriesKeys.includes(dataKey) ? 0 : 1;
}

export const getPaddedAxisLabel = (label: string | number): string =>
  ` ${label} `; // spaces force padding between ticks
