import * as Lib from "metabase-lib";

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
