import * as ML from "cljs/metabase.lib.limit";

import type { Limit, Query } from "./types";

type LimitQuery = Parameters<typeof ML.limit>[0];
type LimitModule = typeof ML & {
  disable_default_limit?: (query: LimitQuery) => LimitQuery;
};

export function currentLimit(query: Query, stageIndex: number): Limit {
  return ML.current_limit(query as unknown as LimitQuery, stageIndex);
}

export function limit(query: Query, stageIndex: number, limit: Limit): Query {
  return ML.limit(
    query as unknown as LimitQuery,
    stageIndex,
    limit,
  ) as unknown as Query;
}

export function hasLimit(query: Query, stageIndex: number) {
  const limit = currentLimit(query, stageIndex);
  return typeof limit === "number" && limit > 0;
}

export function disableDefaultLimit(query: Query): Query {
  const moduleWithDisableDefaultLimit = ML as LimitModule;
  if (moduleWithDisableDefaultLimit.disable_default_limit) {
    return moduleWithDisableDefaultLimit.disable_default_limit(
      query as unknown as LimitQuery,
    ) as unknown as Query;
  }
  return query;
}
