import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import { isNumber } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValues } from "metabase-types/api";

const sum = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const avg = (values: number[]) => sum(values) / values.length;
const min = (values: number[]) => Math.min(...values);
const max = (values: number[]) => Math.max(...values);

const calculateColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
  question: Question,
): (number | null)[] => {
  const datasetQuery = question.datasetQuery();

  const aggFunctions = (datasetQuery?.query?.aggregation ?? []).map(
    agg => agg[0],
  );

  return cols.map((col, colIndex) => {
    const aggregationIndex = col.aggregation_index;
    const aggregationFnName = aggFunctions[aggregationIndex] ?? "sum";
    if (isNumber(col) && col.binning_info == null) {
      const columnValues = rows.map(row => row[colIndex]).filter(isNotNull);

      switch (aggregationFnName) {
        case "sum":
          return sum(columnValues);
        case "avg":
          return avg(columnValues);
        case "min":
          return min(columnValues);
        case "max":
          return max(columnValues);
        default:
          return null;
      }
    }

    return null;
  });
};

export const useColumnTotals = (
  cols: DatasetColumn[],
  rows: RowValues[],
  settings: ComputedVisualizationSettings,
  question: Question,
) => {
  return useMemo(() => {
    if (!settings["table.column_totals"]) {
      return null;
    }

    const columnTotals = calculateColumnTotals(cols, rows, question);
    if (columnTotals.every(total => total == null)) {
      return null;
    }

    return columnTotals;
  }, [cols, question, rows, settings]);
};
