import type { RowValues } from "metabase-types/api";
import type { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { unaggregatedDataWarning } from "metabase/visualizations/lib/warnings";

export const getChartWarnings = (
  chartColumns: ChartColumns,
  rows: RowValues[],
) => {
  const chartValuesKeys = new Set(
    rows.map(row => {
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
