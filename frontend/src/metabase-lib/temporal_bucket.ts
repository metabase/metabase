import { to_array } from "cljs/cljs.core";
import * as ML from "cljs/metabase.lib.core";
import type { Bucket, ColumnMetadata, Query } from "./types";

export function temporalBucket(
  query: Query,
  column: ColumnMetadata,
): Bucket | null {
  return ML.temporal_bucket(query, column);
}

export function availableTemporalBuckets(
  query: Query,
  column: ColumnMetadata,
): Bucket[] {
  return to_array(ML.available_temporal_buckets(query, column));
}

export function withTemporalBucket(
  column: ColumnMetadata,
  bucket: Bucket,
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket);
}
