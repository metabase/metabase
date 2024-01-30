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

declare function FindMatchingColumnFn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  columns: ColumnMetadata[],
): ColumnMetadata | null;

declare function FindMatchingColumnFn(
  fieldRef: FieldReference,
  columns: ColumnMetadata[],
): ColumnMetadata | null;

// TODO: I tried passing both fieldRef and column into a variant with 2 params
// and got an error
export const findMatchingColumn: typeof FindMatchingColumnFn =
  ML.find_matching_column;

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
