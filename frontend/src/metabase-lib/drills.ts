import * as ML from "cljs/metabase.lib.js";
import type { DataRow, Dimension, Query } from "./types";

// NOTE: value might be null or undefined, and they mean different things!
// null means a value of SQL NULL; undefined means no value, ie. a column header was clicked.
export function availableDrillThrus(
  // TODO: What is the right type for a JS column? (Not types.ts ColumnMetadata; that's the opaque CLJS type.)
  query: Query,
  stageIndex: number,
  column: Record<string, unknown>,
  value: any,
  row: DataRow | null,
  dimensions: Dimension[] | null,
): DrillThru[] {
  return ML.available_drill_thrus(
    query,
    stageIndex,
    column,
    value,
    row,
    dimensions,
  );
}

// TODO: Precise types for each of the various extra args?
// Maybe not worth it - we can't easily match the `:type` field from TS. It would need to call through CLJS and
// needs TS functions that return `DrillThru is SomeSpecificDrillThru` type predicates.
export function drillThru(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
  ...args: any[]
): Query {
  return ML.drill_thru(query, stageIndex, drillThru, ...args);
}
