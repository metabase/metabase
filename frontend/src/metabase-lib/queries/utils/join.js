import { add, update, remove, clear } from "./util";

// returns canonical list of Joins, with nulls removed
export function getJoins(joins) {
  return (joins || []).filter(b => b != null);
}

// turns a list of Joins into the canonical JoinClause
function getJoinClause(joins) {
  joins = getJoins(joins);
  if (joins.length === 0) {
    return undefined;
  } else {
    return joins;
  }
}

export function addJoin(join, newJoin) {
  return getJoinClause(add(getJoins(join), newJoin));
}
export function updateJoin(join, index, updatedJoin) {
  return getJoinClause(update(getJoins(join), index, updatedJoin));
}
export function removeJoin(join, index) {
  return getJoinClause(remove(getJoins(join), index));
}
export function clearJoins(join) {
  return getJoinClause(clear());
}
