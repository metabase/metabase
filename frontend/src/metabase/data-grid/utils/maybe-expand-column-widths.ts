import type { ColumnSizingState } from "@tanstack/react-table";

/**
 * Proportionally expands column widths to fill available space while preserving fixed-width columns.
 * Only expands columns when the total width is less than the minimum grid width.
 *
 * @param columnSizingMap - Map of column IDs to their current widths
 * @param fixedWidthColumnIds - Array of column IDs that should maintain their fixed width
 * @param minGridWidth - Minimum width the grid should occupy (optional)
 * @returns Updated column sizing map with potentially expanded column widths
 */
export const maybeExpandColumnWidths = (
  columnSizingMap: ColumnSizingState,
  fixedWidthColumnIds: string[],
  minGridWidth?: number,
) => {
  // If no minimum width is specified or it's invalid, return original sizing
  if (minGridWidth == null || minGridWidth <= 0) {
    return columnSizingMap;
  }

  // Calculate total width of all columns
  const columnsWidths = Object.values(columnSizingMap).reduce((acc, width) => {
    acc += width;
    return acc;
  }, 0);

  // Calculate total width of fixed-width columns
  const fixedWidthColumnsWidths = fixedWidthColumnIds.reduce((acc, id) => {
    acc += columnSizingMap[id] ?? 0;
    return acc;
  }, 0);

  // If current total width already meets or exceeds minimum, no changes needed
  if (minGridWidth <= columnsWidths) {
    return columnSizingMap;
  }

  // Calculate expansion factor for non-fixed columns
  const factor =
    (minGridWidth - fixedWidthColumnsWidths) /
    (columnsWidths - fixedWidthColumnsWidths);

  const newColumnSizingMap = { ...columnSizingMap };

  // Apply expansion to non-fixed columns
  Object.keys(newColumnSizingMap)
    .filter((id) => !fixedWidthColumnIds.includes(id))
    .forEach((key) => {
      newColumnSizingMap[key] = Math.max(
        newColumnSizingMap[key],
        newColumnSizingMap[key] * factor,
      );
    });

  return newColumnSizingMap;
};
