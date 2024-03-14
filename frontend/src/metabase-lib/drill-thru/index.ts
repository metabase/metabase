import * as ML from "cljs/metabase.lib.js";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import { applyColumnExtract, columnExtractDrill } from "./column-extract";

import type {
  ClickObjectDataRow,
  ClickObjectDimension,
  DrillThru,
  Query,
} from "./types";


const TS_DRILLS = [
  columnExtractDrill,
];

export function availableDrillThrusTS(
  query: Query,
  stageIndex: number,
  column: DatasetColumn | undefined,
  value: RowValue | undefined,
  row: ClickObjectDataRow[] | undefined,
  dimensions: ClickObjectDimension[] | undefined,
): DrillThru[] {
  const mlv2Column = column ? ML.legacy_column__GT_metadata(query, stageIndex, column) : column;
  return TS_DRILLS
      .map(drillFn => drillFn(query, stageIndex, mlv2Column, value, row, dimensions))
      .filter(drill => !!drill);
}

export function isTSDrill(drillThru: DrillThru): boolean {
  return drillThru.constructor === Object;
}

type TSDrillThru<Type extends DrillThruType> = { type: Type };

type ApplyDrill<Drill> =
    (query: Query, stageIndex: number, drillThru: DrillThru & {type: Type}, ...args: unknown[]) => Query;

const DRILL_APPLICATIONS: Record<DrillThruType, ApplyDrill<DrillThruType>> = {
  "drill-thru/column-extract": applyColumnExtract,
};

export function drillThruTS(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru & {type: string},
  ...args: unknown[]
): Query {
  return DRILL_APPLICATIONS[drillThru.type](query, stageIndex, drillThru, ...args);
}
