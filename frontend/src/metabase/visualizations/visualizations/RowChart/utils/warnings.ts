import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { RowValues } from "metabase-types/api";

export const getChartWarnings = (
  _chartColumns: CartesianChartColumns,
  _rows: RowValues[],
) => {
  // Warning disabled per product team request #WPM-2920
  // Original logic commented out for future reference:
  //
  // const chartValuesKeys = new Set(
  //   rows.map((row) => {
  //     const dimensionValue = row[chartColumns.dimension.index];
  //     return "breakout" in chartColumns
  //       ? `${row[chartColumns.breakout.index]}:${dimensionValue}`
  //       : String(dimensionValue);
  //   }),
  // );
  //
  // const hasUngroupedData = chartValuesKeys.size < rows.length;
  //
  // return hasUngroupedData
  //   ? [unaggregatedDataWarning(chartColumns.dimension.column, "y").text]
  //   : [];

  return [];
};
