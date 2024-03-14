import * as ML from "cljs/metabase.lib.js";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import { availableDrillThrusTS, drillThruTS, isTSDrill } from "./drill-thru";

import type {
  FilterDrillDetails,
  ColumnMetadata,
  ClickObjectDataRow,
  ClickObjectDimension,
  DrillThru,
  Query,
  PivotType,
} from "./types";

// NOTE: value might be null or undefined, and they mean different things!
// null means a value of SQL NULL; undefined means no value, i.e. a column header was clicked.
export function availableDrillThrus(
  query: Query,
  stageIndex: number,
  column: DatasetColumn | undefined,
  value: RowValue | undefined,
  row: ClickObjectDataRow[] | undefined,
  dimensions: ClickObjectDimension[] | undefined,
): DrillThru[] {
  return ML.available_drill_thrus(
    query,
    stageIndex,
    column,
    value,
    row,
    dimensions,
  ).concat(availableDrillThrusTS(query, stageIndex, column, value, row, dimensions));
}

// TODO: Precise types for each of the various extra args?
export function drillThru(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
  ...args: unknown[]
): Query {
  // If the drillThru is a vanilla TS objects, this drill is implemented in TS.
  return isTSDrill(drillThru) ?
    drillThruTS(query, stageIndex, drillThru, ...args) :
    // If it's another class (eg. a CLJS map), then it's implemented in CLJS.
    ML.drill_thru(query, stageIndex, drillThru, ...args);
}

export function filterDrillDetails(drillThru: DrillThru): FilterDrillDetails {
  return ML.filter_drill_details(drillThru);
}

export function pivotTypes(drillThru: DrillThru): PivotType[] {
  return ML.pivot_types(drillThru);
}

export function pivotColumnsForType(
  drillThru: DrillThru,
  pivotType: PivotType,
): ColumnMetadata[] {
  return ML.pivot_columns_for_type(drillThru, pivotType);
}
