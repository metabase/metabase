import type { DatasetColumn, DatasetData, RowValue, Series } from "metabase-types/api";
import { isCoordinate, isNumber } from "metabase-lib/v1/types/utils/isa";

export interface TableClickedRowData {
  value: RowValue;
  col: DatasetColumn;
}

export interface PivotedDatasetData extends DatasetData {
  sourceRows?: (number | null)[][];
}

/**
 * @param series - First element is the series (single series)
 * @param rowIndex
 * @param columnIndex
 * @param isPivoted
 * @param data - For pivoted tables, contains sourceRows mapping
 */
export function getTableClickedObjectRowData(
  [series]: Series,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
  data: PivotedDatasetData,
): TableClickedRowData[] | null {
  const { rows, cols } = series.data;

  // if pivoted, we need to find the original rowIndex from the pivoted row/columnIndex
  const originalRowIndex = isPivoted
    ? (data.sourceRows?.[rowIndex]?.[columnIndex] ?? null)
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

export interface TableDimension {
  value: RowValue;
  column: DatasetColumn;
}

export interface TableCellClickedObject {
  value: RowValue;
  column: DatasetColumn;
  settings: Record<string, unknown>;
  dimensions?: TableDimension[];
  origin?: { rowIndex: number; row: RowValue[]; cols: DatasetColumn[] };
  data?: TableClickedRowData[] | null;
}

type PivotedRow = RowValue[] & { _dimension?: TableDimension };

export function getTableCellClickedObject(
  data: DatasetData,
  settings: Record<string, unknown>,
  rowIndex: number,
  columnIndex: number,
  isPivoted: boolean,
  clickedRowData: TableClickedRowData[] | null,
): TableCellClickedObject {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0) {
      const { value, column: col } = (row as PivotedRow)._dimension!;
      return { value, column: col, settings, data: [{ value, col }] };
    } else {
      return {
        value,
        column,
        settings,
        dimensions: [
          (row as PivotedRow)._dimension!,
          (column as DatasetColumnWithDimension)._dimension!,
        ],
        data: clickedRowData,
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
      data: clickedRowData,
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
      data: clickedRowData,
    };
  }
}

interface DatasetColumnWithDimension extends DatasetColumn {
  _dimension?: TableDimension;
}

export function getTableHeaderClickedObject(
  data: DatasetData,
  columnIndex: number,
  isPivoted: boolean,
): { column: DatasetColumn } | TableDimension | null {
  const column = data.cols[columnIndex];
  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex >= 0 && column) {
      return (column as DatasetColumnWithDimension)._dimension ?? null;
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
export function isColumnRightAligned(column: DatasetColumn | null | undefined): boolean {
  // handle remapped columns
  if (column?.remapped_to_column) {
    column = column.remapped_to_column;
  }
  return isNumber(column) || isCoordinate(column);
}
