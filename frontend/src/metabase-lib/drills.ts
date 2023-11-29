import * as ML from "cljs/metabase.lib.js";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  ColumnMetadata,
  ClickObjectDataRow,
  ClickObjectDimension,
  DrillThru,
  Query,
  PivotType,
  FilterDrillDetails,
} from "./types";

// NOTE: value might be null or undefined, and they mean different things!
// null means a value of SQL NULL; undefined means no value, i.e. a column header was clicked.
export function availableDrillThrus(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | DatasetColumn | undefined,
  value?: RowValue,
  row?: ClickObjectDataRow[],
  dimensions?: ClickObjectDimension[],
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
export function drillThru(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
  ...args: any[]
): Query {
  return ML.drill_thru(query, stageIndex, drillThru, ...args);
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
