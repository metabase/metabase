import * as Lib from "metabase-lib";

export function hasFilters(query: Lib.Query) {
  const stageIndexes = Lib.filterStageIndexes(query);
  const filters = stageIndexes.flatMap(stageIndex =>
    Lib.filters(query, stageIndex),
  );
  return filters.length > 0;
}

export function removeFilters(query: Lib.Query) {
  const stageIndexes = Lib.filterStageIndexes(query);
  return stageIndexes.reduce(
    (newQuery, stageIndex) => Lib.removeFilters(newQuery, stageIndex),
    query,
  );
}
