import type { ColumnSizingState } from "@tanstack/react-table";

export const pickRowsToMeasure = <TData, TValue>(
  data: TData[],
  accessorFn: (row: TData) => TValue,
  count = 10,
) => {
  const rowIndexes = [];
  for (
    let rowIndex = 0;
    rowIndex < data.length && rowIndexes.length < count;
    rowIndex++
  ) {
    if (accessorFn(data[rowIndex]) != null) {
      rowIndexes.push(rowIndex);
    }
  }
  return rowIndexes;
};

/**
 * Limits column widths to a maximum value
 * @param columnSizingMap Original column sizing state
 * @param truncateWidth Maximum allowed width for any column
 * @returns Column sizing state with all values capped at truncateWidth
 */
export const getTruncatedColumnSizing = (
  columnSizingMap: ColumnSizingState,
  truncateWidth: number,
): ColumnSizingState =>
  Object.fromEntries(
    Object.entries(columnSizingMap).map(([key, value]) => [
      key,
      Math.min(value, truncateWidth),
    ]),
  );
