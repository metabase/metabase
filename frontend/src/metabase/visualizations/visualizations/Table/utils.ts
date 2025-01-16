import type { DatasetData } from "metabase-types/api";

export const pickRowsToMeasure = (
  rows: DatasetData["rows"],
  columnIndex: number,
  count = 10,
) => {
  const rowIndexes = [];
  for (
    let rowIndex = 0;
    rowIndex < rows.length && rowIndexes.length < count;
    rowIndex++
  ) {
    if (rows[rowIndex][columnIndex] != null) {
      rowIndexes.push(rowIndex);
    }
  }
  return rowIndexes;
};
