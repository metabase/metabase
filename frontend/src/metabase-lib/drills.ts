import {
  available_drill_thrus,
  combine_column_drill_details,
  drill_thru,
  filter_drill_details,
  pivot_columns_for_type,
  pivot_drill_details,
} from "cljs/metabase.lib.js";
import type { CardId, DatasetColumn, RowValue } from "metabase-types/api";

import type {
  ClickObjectDataRow,
  ClickObjectDimension,
  ColumnMetadata,
  DrillThru,
  FilterDrillDetails,
  PivotDrillDetails,
  PivotType,
  Query,
} from "./types";

// NOTE: value might be null or undefined, and they mean different things!
// null means a value of SQL NULL; undefined means no value, i.e. a column header was clicked.
export function availableDrillThrus(
  query: Query,
  stageIndex: number,
  cardId: CardId | undefined,
  column: DatasetColumn | undefined,
  value: RowValue | undefined,
  row: ClickObjectDataRow[] | undefined,
  dimensions: ClickObjectDimension[] | undefined,
): DrillThru[] {
  return available_drill_thrus(
    query,
    stageIndex,
    cardId,
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
  cardId: CardId | undefined,
  drillThru: DrillThru,
  ...args: unknown[]
): Query {
  return drill_thru(query, stageIndex, cardId, drillThru, ...args);
}

export function filterDrillDetails(drillThru: DrillThru): FilterDrillDetails {
  return filter_drill_details(drillThru);
}

export function combineColumnDrillDetails(
  drillThru: DrillThru,
): FilterDrillDetails {
  return combine_column_drill_details(drillThru);
}

export function pivotDrillDetails(drillThru: DrillThru): PivotDrillDetails {
  return pivot_drill_details(drillThru);
}

export function pivotColumnsForType(
  drillThru: DrillThru,
  pivotType: PivotType,
): ColumnMetadata[] {
  return pivot_columns_for_type(drillThru, pivotType);
}
