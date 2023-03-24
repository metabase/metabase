import { add, update, remove, clear } from "./util";

// returns canonical list of OrderBys, with nulls removed
export function getOrderBys(breakout) {
  return (breakout || []).filter(b => b != null);
}

// turns a list of OrderBys into the canonical OrderByClause
function getOrderByClause(breakouts) {
  breakouts = getOrderBys(breakouts);
  if (breakouts.length === 0) {
    return undefined;
  } else {
    return breakouts;
  }
}

export function addOrderBy(breakout, newOrderBy) {
  return getOrderByClause(add(getOrderBys(breakout), newOrderBy));
}
export function updateOrderBy(breakout, index, updatedOrderBy) {
  return getOrderByClause(update(getOrderBys(breakout), index, updatedOrderBy));
}
export function removeOrderBy(breakout, index) {
  return getOrderByClause(remove(getOrderBys(breakout), index));
}
export function clearOrderBy(breakout) {
  return getOrderByClause(clear());
}
