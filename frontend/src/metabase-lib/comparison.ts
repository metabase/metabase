import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function findColumnIndexForColumnSetting(
  query,
  stageIndex,
  columns,
  fieldRef,
) {
  return ML.find_column_index_from_legacy_ref(
    query,
    stageIndex,
    columns,
    fieldRef,
  );
}
