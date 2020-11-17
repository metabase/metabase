/* @flow */

import type { Join, JoinClause } from "metabase-types/types/Query";

import { add, update, remove, clear } from "./util";

// returns canonical list of Joins, with nulls removed
export function getJoins(joins: ?JoinClause): Join[] {
  return (joins || []).filter(b => b != null);
}

// turns a list of Joins into the canonical JoinClause
export function getJoinClause(joins: Join[]): ?JoinClause {
  joins = getJoins(joins);
  if (joins.length === 0) {
    return undefined;
  } else {
    return joins;
  }
}

export function addJoin(join: ?JoinClause, newJoin: Join): ?JoinClause {
  return getJoinClause(add(getJoins(join), newJoin));
}
export function updateJoin(
  join: ?JoinClause,
  index: number,
  updatedJoin: Join,
): ?JoinClause {
  return getJoinClause(update(getJoins(join), index, updatedJoin));
}
export function removeJoin(join: ?JoinClause, index: number): ?JoinClause {
  return getJoinClause(remove(getJoins(join), index));
}
export function clearJoins(join: ?JoinClause): ?JoinClause {
  return getJoinClause(clear());
}
