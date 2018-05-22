/* @flow */

import type { OrderBy, OrderByClause } from "metabase/meta/types/Query";

import { add, update, remove, clear } from "./util";

// returns canonical list of OrderBys, with nulls removed
export function getOrderBys(breakout: ?OrderByClause): OrderBy[] {
  return (breakout || []).filter(b => b != null);
}

// turns a list of OrderBys into the canonical OrderByClause
export function getOrderByClause(breakouts: OrderBy[]): ?OrderByClause {
  breakouts = getOrderBys(breakouts);
  if (breakouts.length === 0) {
    return undefined;
  } else {
    return breakouts;
  }
}

export function addOrderBy(
  breakout: ?OrderByClause,
  newOrderBy: OrderBy,
): ?OrderByClause {
  return getOrderByClause(add(getOrderBys(breakout), newOrderBy));
}
export function updateOrderBy(
  breakout: ?OrderByClause,
  index: number,
  updatedOrderBy: OrderBy,
): ?OrderByClause {
  return getOrderByClause(update(getOrderBys(breakout), index, updatedOrderBy));
}
export function removeOrderBy(
  breakout: ?OrderByClause,
  index: number,
): ?OrderByClause {
  return getOrderByClause(remove(getOrderBys(breakout), index));
}
export function clearOrderBy(breakout: ?OrderByClause): ?OrderByClause {
  return getOrderByClause(clear());
}
