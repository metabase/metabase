import { RowValues } from "metabase-types/api";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import { unaggregatedDataWarning } from "metabase/visualizations/lib/warnings";

export const getChartWarnings = (
  chartColumns: ChartColumns,
  rows: RowValues[],
) => {
  const chartValuesKeys = rows.reduce((acc, currentRow) => {
    const dimensionValue = currentRow[chartColumns.dimension.index];
    const valueKey =
      "breakout" in chartColumns
        ? `${currentRow[chartColumns.breakout.index]}:${dimensionValue}`
        : String(dimensionValue);

    acc.add(valueKey);
    return acc;
  }, new Set<string>());

  const hasUngroupedData = chartValuesKeys.size < rows.length;

  return hasUngroupedData
    ? [unaggregatedDataWarning(chartColumns.dimension.column, "y").text]
    : [];
};
