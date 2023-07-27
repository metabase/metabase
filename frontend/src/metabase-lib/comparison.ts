import * as ML from "cljs/metabase.lib.js";
import type {
  DatasetColumn,
  DatasetQuery,
  FieldReference,
} from "metabase-types/api";
import type { ColumnMetadata, Query } from "./types";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function findColumnIndexForColumnSetting(
  query: Query,
  stageIndex: number,
  columns: (DatasetColumn | ColumnMetadata)[],
  legacyFieldRef: FieldReference,
): number {
  return ML.find_column_indexes_from_legacy_refs(query, stageIndex, columns, [
    fieldRef,
  ]);
}
