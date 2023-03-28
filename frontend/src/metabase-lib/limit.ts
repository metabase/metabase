import * as ML from "cljs/metabase.lib.limit";
import type { Query, Limit } from "./types";

const DEFAULT_STAGE_INDEX = -1;

export function currentLimit(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): Limit {
  return ML.current_limit(query, stageIndex);
}

declare function LimitFn(query: Query, limit: Limit): Query;
declare function LimitFn(query: Query, stageIndex: number, limit: Limit): Query;

export const limit: typeof LimitFn = ML.limit;

export function hasLimit(query: Query, stageIndex = DEFAULT_STAGE_INDEX) {
  const limit = currentLimit(query, stageIndex);
  return typeof limit === "number" && limit > 0;
}
