/* @flow */

import type { DatasetData, Column } from "metabase/meta/types/Dataset";
import type { ClickObject } from "metabase/meta/types/Visualization";
import { isNumber, isCoordinate } from "metabase/lib/schema_metadata";

export function getTableCellClickedObject(
  data: DatasetData,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
): ClickObject {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0) {
      // $FlowFixMe: _dimension
      return row._dimension;
    } else {
      return {
        value,
        column,
        // $FlowFixMe: _dimension
        dimensions: [row._dimension, column._dimension],
      };
    }
  } else if (column.source === "aggregation") {
    return {
      value,
      column,
      dimensions: cols
        .map((column, index) => ({ value: row[index], column }))
        .filter(dimension => dimension.column.source === "breakout"),
    };
  } else {
    return { value, column };
  }
}

/*
 * Returns whether the column should be right-aligned in a table.
 * Includes numbers and lat/lon coordinates, but not zip codes, IDs, etc.
 */
export function isColumnRightAligned(column: Column) {
  return isNumber(column) || isCoordinate(column);
}



export function getTableCellClickedObjectForSummary(
  data: DatasetData,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
): ClickObject {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0) {
      // $FlowFixMe: _dimension
      return row._dimension;
    } else {
      return {
        value,
        column,
        // $FlowFixMe: _dimension
        dimensions: [row._dimension, column._dimension],
        isTotalColumnIndex: row.isTotalColumnIndex,
      };
    }
  } else if (row.isTotalColumnIndex !== undefined) {
    return {
//      value: "",
//      column,
      dimensions: cols
        .filter((column, index) => index < row.isTotalColumnIndex)
        .map((column, index) => ({value: row[index], column}))
        .filter(dimension => dimension.column.source === "breakout")
      ,
      isTotalColumnIndex: row.isTotalColumnIndex,
    };
  } else if (column.source === "aggregation") {
//    console.log("[debug] getTableCellClickedObject:  aggregation >  isTotal: ",isTotal,"  value: ",value,"  column:",column);
    return {
      value,
      column,
      dimensions: cols
        .map((column, index) => ({value: row[index], column}))
        .filter(dimension => dimension.column.source === "breakout")
      ,
      isTotalColumnIndex: row.isTotalColumnIndex,
    };
  } else {
//    console.log("[debug] getTableCellClickedObject:  default >  value: "+value+"  column:"+column);
    return { value, column, isTotalColumnIndex: row.isTotalColumnIndex };
  }
}
