import { isCoordinate, isNumber } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DatasetData,
  RowValue,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import type { ClickObject } from "../types";

type Dimension = {
  col: DatasetColumn;
  value: RowValue;
};

export function getTableClickedObjectRowData(
  [series]: Series,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
  data: DatasetData,
): Dimension[] | null {
  const { rows, cols } = series.data;

  // if pivoted, we need to find the original rowIndex from the pivoted row/columnIndex
  const originalRowIndex =
    isPivoted && data.sourceRows
      ? data.sourceRows[rowIndex][columnIndex]
      : rowIndex;

  // originalRowIndex may be null if the pivot table is empty in that cell
  if (originalRowIndex === null) {
    return null;
  } else {
    return rows[originalRowIndex].map((value, index) => ({
      value,
      col: cols[index],
    }));
  }
}

export function getTableCellClickedObject(
  data: DatasetData,
  settings: VisualizationSettings,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
  clickedRowData: Dimension[] | null,
): ClickObject {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0 && row._dimension) {
      const { value: dimensionValue, column: col } = row._dimension;
      return {
        value: dimensionValue,
        column: col,
        settings,
        data: [{ value: dimensionValue, col }],
      };
    } else {
      return {
        value,
        column,
        settings,
        dimensions: [row._dimension, column._dimension].filter(
          (dimension) => dimension != null,
        ),
        data: clickedRowData ?? undefined,
      };
    }
  } else if (column.source === "aggregation") {
    return {
      value,
      column,
      settings,
      dimensions: cols
        .map((col, index) => ({ value: row[index], column: col }))
        .filter((dimension) => dimension.column.source === "breakout"),
      origin: { rowIndex, row, cols },
      data: clickedRowData ?? undefined,
    };
  } else {
    // Clicks on aggregation columns can wind up here if the query has stages after the aggregation / breakout
    // stage. In that case, column.source will be something like "fields", and it's up to Lib.availableDrillThrus
    // to check the underlying column and construct the dimensions from the passed in clickedRowData.
    return {
      value,
      column,
      settings,
      origin: { rowIndex, row, cols },
      data: clickedRowData ?? undefined,
    };
  }
}

export function getTableHeaderClickedObject(
  data: DatasetData,
  columnIndex: number,
  isPivoted: boolean,
): { column: DatasetColumn } | undefined | null {
  const column = data.cols[columnIndex];
  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex >= 0 && column) {
      return column._dimension;
    } else {
      return null; // FIXME?
    }
  } else {
    return {
      column,
    };
  }
}

/*
 * Returns whether the column should be right-aligned in a table.
 * Includes numbers and lat/lon coordinates, but not zip codes, IDs, etc.
 */
export function isColumnRightAligned(
  column: DatasetColumn | undefined,
): boolean | undefined {
  // handle remapped columns
  if (column && column.remapped_to_column) {
    column = column.remapped_to_column;
  }
  return isNumber(column) || isCoordinate(column);
}
