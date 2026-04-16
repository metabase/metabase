const MAX_COLUMNS = 8;
const MIN_SERIES_WIDTH = 300;

export function getGridColumns(
  elementWidth: number,
  seriesCount: number,
): number {
  // Determine how many columns can fit based on the available width,
  // ensuring at least 1 column is always shown
  const columnsByWidth = Math.max(
    1,
    Math.floor(elementWidth / MIN_SERIES_WIDTH),
  );

  // Use the smallest of: columns that fit, number of series, and the max cap
  // so we don't exceed the layout limit or create empty columns
  return Math.min(columnsByWidth, seriesCount, MAX_COLUMNS);
}
