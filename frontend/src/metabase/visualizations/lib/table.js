import type { DatasetData, Column } from "metabase-types/types/Dataset";
import type { ClickObject } from "metabase-types/types/Visualization";
import { isNumber, isCoordinate } from "metabase/lib/schema_metadata";

export function getTableClickedObjectRowData(
  [series],
  rowIndex,
  columnIndex,
  isPivoted,
  data,
) {
  const { rows, cols } = series.data;

  // if pivoted, we need to find the original rowIndex from the pivoted row/columnIndex
  const originalRowIndex = isPivoted
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
  data,
  settings,
  rowIndex,
  columnIndex,
  isPivoted,
  clickedRowData,
) {
  const { rows, cols } = data;

  const column = cols[columnIndex];
  const row = rows[rowIndex];
  const value = row[columnIndex];

  if (isPivoted) {
    // if it's a pivot table, the first column is
    if (columnIndex === 0) {
      return row._dimension;
    } else {
      return {
        value,
        column,
        settings,
        dimensions: [row._dimension, column._dimension],
        data: clickedRowData,
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
      data: clickedRowData,
    };
  } else {
    return {
      value,
      column,
      settings,
      origin: { rowIndex, row, cols },
      data: clickedRowData,
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
    column = column.remapped_to_column;
  }
  return isNumber(column) || isCoordinate(column);
}

/*
 * Make table cohort
 */
export function cohortFormat(isCohorted) {
  let cells = document.getElementsByClassName("table-cell");
  // select all table cells
  for (let i = 0; i < cells.length; i++) {
    if (
      cells.item(i).dataset.columnindex != 0 &&
      cells.item(i).dataset.columnindex != 1
    ) {
      let div = cells.item(i).getElementsByTagName("div");
      // prepare table cells to make cohort counts
      if (!div[0].dataset.cohortValue || !div[0].dataset.originalValue) {
        let defaultValue = [];
        let cells = document.getElementsByClassName("table-cell");
        if (cells.length) {
          for (let i = 0; i < cells.length; i++) {
            let cohortValue;
            let rowindex = cells.item(i).dataset.rowindex;
            let columnindex = cells.item(i).dataset.columnindex;
            let div = cells.item(i).getElementsByTagName("div");
            // not useble for row name
            if (columnindex != 0) {
              //get default value
              if (columnindex == 1) {
                defaultValue[rowindex] = div[0].innerHTML
                  ? div[0].innerHTML.replace(/\D/g, "")
                  : 1;
              } else if (typeof div[0].dataset.cohortValue == "undefined") {
                let cellVal = parseFloat(div[0].innerHTML.replace(/\D/g, ""));
                if (defaultValue[rowindex] && cellVal) {
                  cohortValue =
                    Math.round((cellVal / defaultValue[rowindex]) * 100 * 100) /
                    100;
                } else {
                  cohortValue = 0;
                }
                // store values
                div[0].dataset.cohortValue = cohortValue;
                div[0].dataset.originalValue = div[0].innerHTML
                  ? div[0].innerHTML
                  : "";
              }
            }
          }
        }
      }

      //replace cells data
      if (isCohorted) {
        div[0].innerHTML = div[0].dataset.cohortValue;
      } else {
        div[0].innerHTML = div[0].dataset.originalValue;
      }
    }
  }
  return true;
}
