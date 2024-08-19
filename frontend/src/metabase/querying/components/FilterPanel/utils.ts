import * as Lib from "metabase-lib";
import { getFilterStageIndexes } from "metabase-lib/v1/parameters/utils/targets";

import type { FilterItem } from "./types";

export function getFilterItems(query: Lib.Query): FilterItem[] {
  const stageIndexes = getFilterStageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const filters = Lib.filters(query, stageIndex);
    return filters.map(filter => ({ filter, stageIndex }));
  });
}
