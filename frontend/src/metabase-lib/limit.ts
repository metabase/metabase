import {
  current_limit as _current_limit,
  limit as _limit,
} from "cljs/metabase.lib.core";
import type { Query, Limit } from "./types";

export function currentLimit(query: Query): Limit {
  return _current_limit(query);
}

export function limit(query: Query, limit: Limit): Query {
  return _limit(query, limit);
}

export function hasLimit(query: Query) {
  const limit = currentLimit(query);
  return typeof limit === "number" && limit > 0;
}
