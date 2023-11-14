import * as Lib from "metabase-lib";

export function findBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata | undefined {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  return columns.find(column => {
    if (!Lib.isDate(column)) {
      return false;
    }

    const { breakoutPosition } = Lib.displayInfo(query, stageIndex, column);
    if (breakoutPosition == null) {
      return false;
    }

    const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
    return buckets.length !== 0;
  });
}

export function findFilterColumn(
  query: Lib.Query,
  stageIndex: number,
  breakoutColumn: Lib.ColumnMetadata,
) {
  const columns = Lib.filterableColumns(query, stageIndex);
  return Lib.findMatchingColumn(breakoutColumn, columns) ?? undefined;
}

export function findFilterClause(
  query: Lib.Query,
  stageIndex: number,
  filterColumn: Lib.ColumnMetadata,
): Lib.FilterClause | undefined {
  const filters = Lib.filters(query, stageIndex);
  const { filterPositions } = Lib.displayInfo(query, stageIndex, filterColumn);
  return filterPositions != null && filterPositions.length > 0
    ? filters[filterPositions[0]]
    : undefined;
}

export function findBreakoutClause(
  query: Lib.Query,
  stageIndex: number,
  breakoutColumn: Lib.ColumnMetadata,
): Lib.BreakoutClause | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPosition } = Lib.displayInfo(
    query,
    stageIndex,
    breakoutColumn,
  );
  return breakoutPosition != null ? breakouts[breakoutPosition] : undefined;
}
