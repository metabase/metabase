import * as ML from "cljs/metabase.lib.js";
import type { DatasetQuery } from "metabase-types/api";
import { displayInfo } from "./metadata";
import type { Bucket, Clause, ColumnMetadata, Query } from "./types";

export function areLegacyQueriesEqual(
  query1: DatasetQuery,
  query2: DatasetQuery,
  fieldIds?: number[],
): boolean {
  return ML.query_EQ_(query1, query2, fieldIds);
}

export function isClauseColumn(
  query: Query,
  clause: Clause,
  column: ColumnMetadata,
) {
  const clauseInfo = displayInfo(query, clause);
  const columnInfo = displayInfo(query, column);

  return (
    clauseInfo.table?.name === columnInfo.table?.name &&
    clauseInfo.name === columnInfo.name
  );
}

export function isSameBucket(query: Query, bucket1: Bucket, bucket2: Bucket) {
  const info1 = displayInfo(query, bucket1);
  const info2 = displayInfo(query, bucket2);
  return info1.displayName === info2.displayName;
}
