import * as ML from "cljs/metabase.lib.limit";

import type { Query, Limit } from "./types";

export function currentLimit(query: Query, stageIndex: number): Limit {
  return ML.current_limit(query, stageIndex);
}

export function limit(query: Query, stageIndex: number, limit: Limit): Query {
  return ML.limit(query, stageIndex, limit);
}

export function hasLimit(query: Query, stageIndex: number) {
  const limit = currentLimit(query, stageIndex);
  return typeof limit === "number" && limit > 0;
}
