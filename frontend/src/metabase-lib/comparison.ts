import * as ML from "cljs/metabase.lib.js";
import type {
  DatasetColumn,
  DatasetQuery,
  FieldReference,
} from "metabase-types/api";
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
) {
  const name1 = displayInfo(query, stageIndex, column1).longDisplayName;
  const name2 = displayInfo(query, stageIndex, column2).longDisplayName;
  return name1 === name2;
}

export function findColumnIndexesFromLegacyRefs(
  query: Query,
  stageIndex: number,
  columns: ColumnMetadata[] | DatasetColumn[],
  fieldRefs: FieldReference[],
): number[] {
  return ML.find_column_indexes_from_legacy_refs(
    query,
    stageIndex,
    columns,
    fieldRefs,
  );
}
