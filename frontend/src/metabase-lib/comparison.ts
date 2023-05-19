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

function isAutoBin(query: Query, bucket1: Bucket, bucket2: Bucket) {
  const info1 = displayInfo(query, bucket1);
  const info2 = displayInfo(query, bucket2);

  const isAutoBin1 =
    info1.displayName === "Auto binned" || info1.displayName === "Auto bin";
  const isAutoBin2 =
    info2.displayName === "Auto binned" || info2.displayName === "Auto bin";

  return isAutoBin1 && isAutoBin2;
}

function isWithoutBinning(query: Query, bucket: Bucket | undefined | null) {
  return !bucket || displayInfo(query, bucket).displayName === "Don't bin";
}

export function isSameBucket(
  query: Query,
  bucket1: Bucket | undefined | null,
  bucket2: Bucket | undefined | null,
): boolean {
  if (!bucket1 && !bucket2) {
    return false;
  }

  if (bucket1 && bucket2) {
    const info1 = displayInfo(query, bucket1);
    const info2 = displayInfo(query, bucket2);
    return (
      info1.displayName === info2.displayName ||
      isAutoBin(query, bucket1, bucket2)
    );
  }

  return isWithoutBinning(query, bucket1) && isWithoutBinning(query, bucket2);
}
