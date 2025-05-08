import {
  find_column_indexes_from_legacy_refs,
  find_matching_column,
  query_EQ_,
} from "cljs/metabase.lib.js";
import type { DatasetQuery, DimensionReference } from "metabase-types/api";

import type { ColumnMetadata, Query } from "./types";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return query_EQ_(query1, query2, fieldIds);
}

export function findMatchingColumn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  columns: ColumnMetadata[],
): ColumnMetadata | null {
  return find_matching_column(query, stageIndex, column, columns);
}

export function findColumnIndexesFromLegacyRefs(
  query: Query,
  stageIndex: number,
  columns: ColumnMetadata[],
  fieldRefs: DimensionReference[],
): number[] {
  return find_column_indexes_from_legacy_refs(
    query,
    stageIndex,
    columns,
    fieldRefs,
  );
}
