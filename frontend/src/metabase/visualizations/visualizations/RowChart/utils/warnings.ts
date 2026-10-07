import {
  type CartesianChartColumns,
  unaggregatedDataWarning,
} from "metabase/viz-core";
import type { RowValues } from "metabase-types/api";

export const getChartWarnings = (
  chartColumns: CartesianChartColumns,
  rows: RowValues[],
) => {
  const chartValuesKeys = new Set(
    rows.map((row) => {
      const dimensionValue = row[chartColumns.dimension.index];
      return "breakout" in chartColumns
        ? `${row[chartColumns.breakout.index]}:${dimensionValue}`
        : String(dimensionValue);
    }),
  );

  const hasUngroupedData = chartValuesKeys.size < rows.length;

  return hasUngroupedData
    ? [unaggregatedDataWarning(chartColumns.dimension.column, "y").text]
    : [];
};
