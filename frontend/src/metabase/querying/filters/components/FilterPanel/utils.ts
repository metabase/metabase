import * as Lib from "metabase-lib";

import type { FilterItem } from "./types";

export function getFilterItems(query: Lib.Query): FilterItem[] {
  const stageIndexes = Lib.stageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const filters = Lib.filters(query, stageIndex);
    return filters.map(filter => ({ filter, stageIndex }));
  });
}
