import { add, update, remove } from "./util";

// returns canonical list of Breakouts, with nulls removed
export function getBreakouts(breakouts) {
  return (breakouts || []).filter(b => b != null);
}

// turns a list of Breakouts into the canonical BreakoutClause
function getBreakoutClause(breakouts) {
  breakouts = getBreakouts(breakouts);
  if (breakouts.length === 0) {
    return undefined;
  } else {
    return breakouts;
  }
}

export function addBreakout(breakout, newBreakout) {
  return getBreakoutClause(add(getBreakouts(breakout), newBreakout));
}
export function updateBreakout(breakout, index, updatedBreakout) {
  return getBreakoutClause(
    update(getBreakouts(breakout), index, updatedBreakout),
  );
}
