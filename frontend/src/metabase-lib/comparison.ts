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
  stageIndex: number,
  clause: Clause,
  column: ColumnMetadata,
) {
  const clauseInfo = displayInfo(query, stageIndex, clause);
  const columnInfo = displayInfo(query, stageIndex, column);

  return (
    clauseInfo.table?.name === columnInfo.table?.name &&
    clauseInfo.name === columnInfo.name
  );
}

function isAutoBin(
  query: Query,
  stageIndex: number,
  bucket1: Bucket,
  bucket2: Bucket,
) {
  const info1 = displayInfo(query, stageIndex, bucket1);
  const info2 = displayInfo(query, stageIndex, bucket2);

  const isAutoBin1 =
    info1.displayName === "Auto binned" || info1.displayName === "Auto bin";
  const isAutoBin2 =
    info2.displayName === "Auto binned" || info2.displayName === "Auto bin";

  return isAutoBin1 && isAutoBin2;
}

function isWithoutBinning(
  query: Query,
  stageIndex: number,
  bucket: Bucket | undefined | null,
) {
  return (
    !bucket ||
    displayInfo(query, stageIndex, bucket).displayName === "Don't bin"
  );
}

export function isSameBucket(
  query: Query,
  stageIndex: number,
  bucket1: Bucket | undefined | null,
  bucket2: Bucket | undefined | null,
): boolean {
  if (!bucket1 && !bucket2) {
    return false;
  }

  if (bucket1 && bucket2) {
    const info1 = displayInfo(query, stageIndex, bucket1);
    const info2 = displayInfo(query, stageIndex, bucket2);
    return (
      info1.displayName === info2.displayName ||
      isAutoBin(query, stageIndex, bucket1, bucket2)
    );
  }

  return (
    isWithoutBinning(query, stageIndex, bucket1) &&
    isWithoutBinning(query, stageIndex, bucket2)
  );
}
