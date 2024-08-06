import * as Lib from "metabase-lib";

export function findBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata | undefined {
  const columns = Lib.breakoutableColumns(query, stageIndex);
  return columns.find(column => {
    if (!Lib.isTemporal(column)) {
      return false;
    }

    const { breakoutPositions = [] } = Lib.displayInfo(
      query,
      stageIndex,
      column,
    );
    return breakoutPositions.length > 0;
  });
}

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
  breakoutColumn: Lib.ColumnMetadata,
): Lib.BreakoutClause | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(
    query,
    stageIndex,
    breakoutColumn,
  );
  return breakoutPositions.length > 0
    ? breakouts[breakoutPositions[0]]
    : undefined;
}
