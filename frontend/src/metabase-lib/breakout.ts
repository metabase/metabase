import * as ML from "cljs/metabase.lib.js";

import { removeClause } from "./query";
import type { BreakoutClause, ColumnMetadata, Query } from "./types";

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

export function breakoutColumn(
  query: Query,
  stageIndex: number,
  breakout: BreakoutClause,
): ColumnMetadata {
  return ML.breakout_column(query, stageIndex, breakout);
}
