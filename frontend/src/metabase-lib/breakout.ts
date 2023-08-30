import * as ML from "cljs/metabase.lib.js";
import type { BreakoutClause, ColumnMetadata, Query } from "./types";
import { removeClause } from "./query";

export function breakoutableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.breakoutable_columns(query, stageIndex);
}

export function breakouts(query: Query, stageIndex: number): BreakoutClause[] {
  return ML.breakouts(query, stageIndex);
}

export function breakout(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Query {
  return ML.breakout(query, stageIndex, column);
}

export function replaceBreakouts(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
) {
  let nextQuery = query;

  breakouts(query, stageIndex).forEach(clause => {
    nextQuery = removeClause(nextQuery, stageIndex, clause);
  });

  return breakout(nextQuery, stageIndex, column);
}

/**
 * If there is a breakout at index, return query with it removed; otherwise return query as-is.
 */
export function removeBreakoutAtIndex(
  query: Query,
  stageIndex: number,
  breakoutIndex: number,
): Query {
  return ML.remove_breakout_at_index(query, stageIndex, breakoutIndex);
}

/**
 * Remove all breakouts from a stage of a query.
 */
export function clearBreakouts(query: Query, stageIndex: number): Query {
  return ML.clear_breakouts(query, stageIndex);
}
