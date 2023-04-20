import * as ML from "cljs/metabase.lib.js";
import type { BreakoutClause, ColumnMetadata, Query } from "./types";

const DEFAULT_STAGE_INDEX = -1;

export function breakoutableColumns(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): ColumnMetadata[] {
  return ML.breakoutable_columns(query, stageIndex);
}

export function breakouts(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): BreakoutClause[] {
  return ML.breakouts(query, stageIndex);
}

declare function BreakoutFn(query: Query, column: ColumnMetadata): Query;

declare function BreakoutFn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Query;

export const breakout: typeof BreakoutFn = ML.breakout;
