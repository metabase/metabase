import * as Lib from "metabase-lib";

export function findColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata | undefined {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  if (columns.length === 0) {
    return;
  }

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

export function findFilterClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Lib.FilterClause | undefined {
  const filters = Lib.filters(query, stageIndex);
  const { filterPositions } = Lib.displayInfo(query, stageIndex, column);
  return filterPositions != null && filterPositions.length > 0
    ? filters[filterPositions[0]]
    : undefined;
}

export function findBreakoutClause(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Lib.BreakoutClause | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPosition } = Lib.displayInfo(query, stageIndex, column);
  return breakoutPosition != null ? breakouts[breakoutPosition] : undefined;
}
