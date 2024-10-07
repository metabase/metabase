import * as Lib from "metabase-lib";

export function findFilterColumn(
  query: Lib.Query,
  stageIndex: number,
  breakoutColumn: Lib.ColumnMetadata,
): Lib.ColumnMetadata | undefined {
  const columns = Lib.filterableColumns(query, stageIndex);
  const filterColumn = Lib.findMatchingColumn(
    query,
    stageIndex,
    breakoutColumn,
    columns,
  );

  return filterColumn ?? undefined;
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
): Lib.BreakoutClause | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  return breakouts.find(breakout => {
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    return Lib.isDateOrDateTime(column);
  });
}
