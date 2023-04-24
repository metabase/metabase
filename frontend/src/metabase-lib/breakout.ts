import * as ML from "cljs/metabase.lib.js";
import type { Clause, ColumnMetadata, Query } from "./types";

const DEFAULT_STAGE_INDEX = -1;

export function breakouts(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): Clause[] {
  return ML.breakouts(query, stageIndex);
}

declare function BreakoutFn(query: Query, column: ColumnMetadata): Query;

declare function BreakoutFn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Query;

export const breakout: typeof BreakoutFn = ML.breakout;
