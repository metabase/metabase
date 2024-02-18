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

export function findMatchingColumn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  columns: ColumnMetadata[],
): ColumnMetadata | null {
  return ML.find_matching_column(query, stageIndex, column, columns);
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
