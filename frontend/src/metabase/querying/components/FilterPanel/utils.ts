import * as Lib from "metabase-lib";
import type { FilterItem } from "./types";

export function getFilterItems(query: Lib.Query): FilterItem[] {
  const stageCount = Lib.stageCount(query);
  const stageIndexes = stageCount > 1 ? [-2, -1] : [-1];

  return stageIndexes.flatMap(stageIndex => {
    const filters = Lib.filters(query, stageIndex);
    return filters.map(filter => ({ filter, stageIndex }));
  });
}

export function dropStageIfEmpty(query: Lib.Query): Lib.Query {
  return Lib.dropStageIfEmpty(query, -1);
}
