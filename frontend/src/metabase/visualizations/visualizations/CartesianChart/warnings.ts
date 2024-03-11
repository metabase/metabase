import type { RowValues } from "metabase-types/api";
import type { BaseCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { unaggregatedDataWarning } from "metabase/visualizations/lib/warnings";

export const getChartWarnings = (chartModel: BaseCartesianChartModel) => {
  // const chartValuesKeys = new Set(
  //   rows.map(row => {
  //     const dimensionValue = row[chartColumns.dimension.index];
  //     return "breakout" in chartColumns
  //       ? `${row[chartColumns.breakout.index]}:${dimensionValue}`
  //       : String(dimensionValue);
  //   }),
  // );

  // const hasUngroupedData = chartValuesKeys.size < rows.length;
  // return hasUngroupedData
  //   ? [unaggregatedDataWarning(chartModel.dimensionModel.column, "x").text]
  //   : [];

  return [];
};
