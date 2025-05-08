import {
  current_limit as cljs_current_limit,
  limit as cljs_limit,
} from "cljs/metabase.lib.limit";

import type { Limit, Query } from "./types";

export function currentLimit(query: Query, stageIndex: number): Limit {
  return cljs_current_limit(query, stageIndex);
}

export function limit(query: Query, stageIndex: number, limit: Limit): Query {
  return cljs_limit(query, stageIndex, limit);
}

export function hasLimit(query: Query, stageIndex: number) {
  const limit = currentLimit(query, stageIndex);
  return typeof limit === "number" && limit > 0;
}
