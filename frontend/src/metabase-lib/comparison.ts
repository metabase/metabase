import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import type { ColumnMetadata, Query } from "./types";
import { displayInfo } from "./metadata";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function isSameColumn(
  query: Query,
  stageIndex: number,
  column1: ColumnMetadata,
  column2: ColumnMetadata,
): boolean {
  const info1 = displayInfo(query, stageIndex, column1);
  const info2 = displayInfo(query, stageIndex, column2);
  return info1.name === info2.name && info1?.table?.name === info2?.table?.name;
}
