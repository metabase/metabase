import {
  breakout_column,
  breakoutable_columns,
  breakout as cljs_breakout,
  breakouts as cljs_breakouts,
} from "cljs/metabase.lib.js";

import { removeClause } from "./query";
import type { BreakoutClause, ColumnMetadata, Query } from "./types";

export function breakoutableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return breakoutable_columns(query, stageIndex);
}

export function breakouts(query: Query, stageIndex: number): BreakoutClause[] {
  return cljs_breakouts(query, stageIndex);
}

export function breakout(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Query {
  return cljs_breakout(query, stageIndex, column);
}

export function replaceBreakouts(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
) {
  let nextQuery = query;

  breakouts(query, stageIndex).forEach((clause) => {
    nextQuery = removeClause(nextQuery, stageIndex, clause);
  });

  return breakout(nextQuery, stageIndex, column);
}

export function breakoutColumn(
  query: Query,
  stageIndex: number,
  breakout: BreakoutClause,
): ColumnMetadata {
  return breakout_column(query, stageIndex, breakout);
}
