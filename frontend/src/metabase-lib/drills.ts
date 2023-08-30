import * as ML from "cljs/metabase.lib.js";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  ColumnMetadata,
  DataRow,
  Dimension,
  DrillThru,
  Query,
} from "./types";

// Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair
// NOTE: value might be null or undefined, and they mean different things!
// null means a value of SQL NULL; undefined means no value, ie. a column header was clicked.
export function availableDrillThrus(
  // TODO: What is the right type for a JS column? (Not types.ts ColumnMetadata; that's the opaque CLJS type.)
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | DatasetColumn | undefined,
  value: RowValue | undefined,
  row: DataRow | undefined,
  dimensions: Dimension[] | undefined,
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

// Applies the given `drill-thru` to the specified query and stage. Returns the updated query
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

// Returns an array of pivotable columns of the specified type
// ML.pivot_columns_for_type;

// Returns an array of pivot types that are available in this drill-thru, which must be a pivot drill-thru
export function getAvailablePivotDrillTypes(drillThru: DrillThru) {
  return ML.pivot_types(drillThru);
}
