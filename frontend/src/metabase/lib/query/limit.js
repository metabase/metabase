/* @flow */

import type { LimitClause } from "metabase-types/types/Query";

export function getLimit(lc: ?LimitClause): ?number {
  return lc;
}

export function updateLimit(lc: ?LimitClause, limit: ?number): ?LimitClause {
  return limit;
}

export function clearLimit(lc: ?LimitClause): ?LimitClause {
  return undefined;
}
