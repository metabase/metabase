import { to_array } from "cljs/cljs.core";
import * as ML from "cljs/metabase.lib.core";
import type { ColumnMetadata, TemporalBucket, Query } from "./types";

export function temporalBucket(
  query: Query,
  column: ColumnMetadata,
): TemporalBucket | null {
  return ML.temporal_bucket(query, column);
}

export function availableTemporalBuckets(
  query: Query,
  column: ColumnMetadata,
): TemporalBucket[] {
  return to_array(ML.available_temporal_buckets(query, column));
}

export function withTemporalBucket(
  column: ColumnMetadata,
  bucket: TemporalBucket,
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket);
}
