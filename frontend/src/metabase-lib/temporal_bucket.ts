import { to_array } from "cljs/cljs.core";
import {
  temporal_bucket,
  available_temporal_buckets,
  with_temporal_bucket,
} from "cljs/metabase.lib.core";
import type { Bucket, ColumnMetadata, Query } from "./types";

export function temporalBucket(column: ColumnMetadata): Bucket | null {
  return temporal_bucket(query, column);
}

export function availableTemporalBuckets(
  query: Query,
  column: ColumnMetadata,
): Bucket[] {
  return to_array(available_temporal_buckets(query, column));
}

export function withTemporalBucket(
  column: ColumnMetadata,
  bucket: Bucket,
): ColumnMetadata {
  return with_temporal_bucket(column, bucket);
}
