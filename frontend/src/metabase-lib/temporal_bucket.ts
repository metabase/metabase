import * as ML from "cljs/metabase.lib.js";
import type { Bucket, ColumnMetadata, Clause, Query } from "./types";

export function temporalBucket(clause: Clause | ColumnMetadata): Bucket | null {
  return ML.temporal_bucket(clause);
}

export function availableTemporalBuckets(
  query: Query,
  column: ColumnMetadata,
): Bucket[] {
  return ML.available_temporal_buckets(query, column);
}

export function withTemporalBucket(
  column: ColumnMetadata,
  bucket: Bucket,
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket);
}
