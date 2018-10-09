/* @flow */

import type { Breakout, BreakoutClause } from "metabase/meta/types/Query";
import type { TableMetadata } from "metabase/meta/types/Metadata";
import type { Field } from "metabase/meta/types/Field";

import Q from "metabase/lib/query";

import { add, update, remove, clear } from "./util";

// returns canonical list of Breakouts, with nulls removed
export function getBreakouts(breakouts: ?BreakoutClause): Breakout[] {
  return (breakouts || []).filter(b => b != null);
}

export function getBreakoutFields(
  breakouts: ?BreakoutClause,
  tableMetadata: TableMetadata,
): Field[] {
  return getBreakouts(breakouts).map(
    breakout => (Q.getFieldTarget(breakout, tableMetadata) || {}).field,
  );
}

// turns a list of Breakouts into the canonical BreakoutClause
export function getBreakoutClause(breakouts: Breakout[]): ?BreakoutClause {
  breakouts = getBreakouts(breakouts);
  if (breakouts.length === 0) {
    return undefined;
  } else {
    return breakouts;
  }
}

export function addBreakout(
  breakout: ?BreakoutClause,
  newBreakout: Breakout,
): ?BreakoutClause {
  return getBreakoutClause(add(getBreakouts(breakout), newBreakout));
}
export function updateBreakout(
  breakout: ?BreakoutClause,
  index: number,
  updatedBreakout: Breakout,
): ?BreakoutClause {
  return getBreakoutClause(
    update(getBreakouts(breakout), index, updatedBreakout),
  );
}
export function removeBreakout(
  breakout: ?BreakoutClause,
  index: number,
): ?BreakoutClause {
  return getBreakoutClause(remove(getBreakouts(breakout), index));
}
export function clearBreakouts(breakout: ?BreakoutClause): ?BreakoutClause {
  return getBreakoutClause(clear());
}
