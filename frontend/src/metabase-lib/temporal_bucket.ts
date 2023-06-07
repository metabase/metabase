import * as ML from "cljs/metabase.lib.js";
import { displayInfo } from "./metadata";
import type { Bucket, ColumnMetadata, Clause, Query } from "./types";

export function temporalBucket(clause: Clause | ColumnMetadata): Bucket | null {
  return ML.temporal_bucket(clause);
}

export function availableTemporalBuckets(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Bucket[] {
  return ML.available_temporal_buckets(query, stageIndex, column);
}

export function isTemporalBucketable(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
) {
  return availableTemporalBuckets(query, stageIndex, column).length > 0;
}

export function withTemporalBucket(
  column: ColumnMetadata,
  bucket: Bucket,
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket);
}

export function withDefaultTemporalBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
) {
  const buckets = availableTemporalBuckets(query, stageIndex, column);
  const defaultBucket = buckets.find(
    bucket => displayInfo(query, stageIndex, bucket).default,
  );
  return defaultBucket ? withTemporalBucket(column, defaultBucket) : column;
}
