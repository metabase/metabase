/* @flow */

import type { DatasetData, Column } from "metabase-types/types/Dataset";
import type { ClickObject } from "metabase-types/types/Visualization";
import type { VisualizationSettings } from "metabase-types/types/Card";
import { isNumber, isCoordinate } from "metabase/lib/schema_metadata";

export function getTableCellClickedObject(
  data: DatasetData,
  settings: VisualizationSettings,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
): ClickObject {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];
  const dataForClick = row.map((value, index) => ({ value, col: cols[index] }));

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0) {
      // $FlowFixMe: _dimension
      return row._dimension;
    } else {
      return {
        value,
        column,
        settings,
        // $FlowFixMe: _dimension
        dimensions: [row._dimension, column._dimension],
        data: dataForClick,
      };
    }
  } else if (column.source === "aggregation") {
    return {
      value,
      column,
      settings,
      dimensions: cols
        .map((column, index) => ({ value: row[index], column }))
        .filter(dimension => dimension.column.source === "breakout"),
      origin: { rowIndex, row, cols },
      data: dataForClick,
    };
  } else {
    return {
      value,
      column,
      settings,
      origin: { rowIndex, row, cols },
      data: dataForClick,
    };
  }
}

export function getTableHeaderClickedObject(
  data: DatasetData,
  columnIndex: number,
  isPivoted: boolean,
): ?ClickObject {
  const column = data.cols[columnIndex];
  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex >= 0 && column) {
      // $FlowFixMe: _dimension
      return column._dimension;
    } else {
      return null; // FIXME?
    }
  } else {
    return { column };
  }
}

/*
 * Returns whether the column should be right-aligned in a table.
 * Includes numbers and lat/lon coordinates, but not zip codes, IDs, etc.
 */
export function isColumnRightAligned(column: Column) {
  // handle remapped columns
  if (column && column.remapped_to_column) {
    // $FlowFixMe: remapped_to_column
    column = column.remapped_to_column;
  }
  return isNumber(column) || isCoordinate(column);
}
