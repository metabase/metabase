import {
  isPivotDetailRow,
  isPivotGroupColumn,
} from "metabase/visualizations/lib/data_grid";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData } from "metabase-types/api";

/**
 * Pivot-aware datasetContainsNoResults: a pivot always returns a grand-total row
 * via GROUPING SETS, so it has no results only when no row is a detail row.
 */
export function hasNoResults(
  data: Pick<DatasetData, "rows" | "cols">,
): boolean {
  if (datasetContainsNoResults(data)) {
    return true;
  }

  const pivotGroupingIndex = data.cols.findIndex(isPivotGroupColumn);
  if (pivotGroupingIndex === -1) {
    return false;
  }

  return !data.rows.some((row) => isPivotDetailRow(row, pivotGroupingIndex));
}
