import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValues } from "metabase-types/api";

const sum = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const avg = (values: number[]) => sum(values) / values.length;
const min = (values: number[]) => Math.min(...values);
const max = (values: number[]) => Math.max(...values);

const aggFunctionByName = {
  sum,
  count: sum,
  "cum-sum": max,
  max,
  min,
  avg,
};

const calculateColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
): (number | null)[] => {
  return cols.map((col, colIndex) => {
    const aggregationFunctionName = col.aggregation_function ?? "sum";
    const aggregationFunction = aggFunctionByName[aggregationFunctionName];
    if (
      isNumber(col) &&
      col.binning_info == null &&
      aggregationFunction != null
    ) {
      const columnValues = rows.map(row => row[colIndex]).filter(isNotNull);

      return aggregationFunction(columnValues);
    }

    return null;
  });
};

export const useColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
  settings: ComputedVisualizationSettings,
) => {
  return useMemo(() => {
    if (!settings["table.column_totals"]) {
      return null;
    }

    const columnTotals = calculateColumnTotals(cols, rows);
    if (columnTotals.every(total => total == null)) {
      return null;
    }

    return columnTotals;
  }, [cols, rows, settings]);
};
