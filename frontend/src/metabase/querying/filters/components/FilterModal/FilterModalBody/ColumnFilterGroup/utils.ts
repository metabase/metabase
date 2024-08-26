import * as Lib from "metabase-lib";

export function findColumnFilters(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Lib.FilterClause[] {
  const filters = Lib.filters(query, stageIndex);
  const { filterPositions } = Lib.displayInfo(query, stageIndex, column);
  return filterPositions != null
    ? filterPositions.map(index => filters[index])
    : [];
}

export function findVisibleFilters(
  filters: Lib.FilterClause[],
  initialFilterCount: number,
): (Lib.FilterClause | undefined)[] {
  return Array(Math.max(filters.length, initialFilterCount, 1))
    .fill(undefined)
    .map((_, i) => filters[i]);
}
