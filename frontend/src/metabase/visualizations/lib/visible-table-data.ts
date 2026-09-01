import * as DataGrid from "metabase/visualizations/lib/data_grid";
import {
  type ComputedVisualizationSettings,
  isPivoted,
} from "metabase/viz-core";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData, RawSeries } from "metabase-types/api";

export type VisibleTableData = Pick<
  DatasetData,
  "cols" | "rows" | "results_timezone" | "rows_truncated" | "sourceRows"
>;

export function getClassicPivotColumnIndexes(
  data: Pick<DatasetData, "cols">,
  settings: ComputedVisualizationSettings,
) {
  const pivotIndex = data.cols.findIndex(
    (col) => col.name === settings["table.pivot_column"],
  );
  const cellIndex = data.cols.findIndex(
    (col) => col.name === settings["table.cell_column"],
  );
  const normalIndex = data.cols.findIndex(
    (_col, index) => index !== pivotIndex && index !== cellIndex,
  );
  return { pivotIndex, cellIndex, normalIndex };
}

export function getVisibleTableData({
  series,
  settings,
  isShowingDetailsOnlyColumns = false,
  isShowingDisabledColumns = isShowingDetailsOnlyColumns,
}: {
  series: RawSeries;
  settings: ComputedVisualizationSettings;
  isShowingDetailsOnlyColumns?: boolean;
  isShowingDisabledColumns?: boolean;
}): VisibleTableData {
  const [{ data }] = series;

  if (isPivoted(series, settings)) {
    const { pivotIndex, cellIndex, normalIndex } = getClassicPivotColumnIndexes(
      data,
      settings,
    );
    return {
      ...DataGrid.pivot(data, normalIndex, pivotIndex, cellIndex, settings),
      results_timezone: data.results_timezone,
    };
  }

  const { cols, rows, results_timezone, rows_truncated } = data;
  const columnSettings = settings["table.columns"] ?? [];

  const isColumnVisible = (columnIndex: number, settingIndex: number) => {
    if (columnIndex < 0) {
      return false;
    }
    const isDetailsOnlyColumn =
      cols[columnIndex].visibility_type === "details-only";
    if (isDetailsOnlyColumn && !isShowingDetailsOnlyColumns) {
      return false;
    }
    return isShowingDisabledColumns || columnSettings[settingIndex].enabled;
  };

  const columnIndexes = findColumnIndexesForColumnSettings(
    cols,
    columnSettings,
  ).filter(isColumnVisible);

  return {
    cols: columnIndexes.map((i) => cols[i]),
    rows: rows.map((row) => columnIndexes.map((i) => row[i])),
    results_timezone,
    rows_truncated,
  };
}
