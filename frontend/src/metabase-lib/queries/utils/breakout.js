import { add, update, remove } from "./util";

/**
 * Returns canonical list of Breakouts, with nulls removed
 * @deprecated use MLv2
 */
export function getBreakouts(breakouts) {
  return (breakouts || []).filter(b => b != null);
}

/**
 * Turns a list of Breakouts into the canonical BreakoutClause
 */
function getBreakoutClause(breakouts) {
  breakouts = getBreakouts(breakouts);
  if (breakouts.length === 0) {
    return undefined;
  } else {
    return breakouts;
  }
}

/**
 * @deprecated use MLv2
 */
export function addBreakout(breakout, newBreakout) {
  return getBreakoutClause(add(getBreakouts(breakout), newBreakout));
}

/**
 * @deprecated use MLv2
 */
export function updateBreakout(breakout, index, updatedBreakout) {
  return getBreakoutClause(
    update(getBreakouts(breakout), index, updatedBreakout),
  );
}

/**
 * @deprecated use MLv2
 */
export function removeBreakout(breakout, index) {
  return getBreakoutClause(remove(getBreakouts(breakout), index));
}
