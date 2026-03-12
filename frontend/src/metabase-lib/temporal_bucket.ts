import * as ML from "cljs/metabase.lib.js";
import type { TemporalUnit } from "metabase-types/api";

import { displayInfo } from "./metadata";
import type {
  BreakoutClause,
  Bucket,
  BucketOption,
  ColumnMetadata,
  Query,
} from "./types";

type TemporalBucketTarget = Parameters<typeof ML.temporal_bucket>[0];
type TemporalBucketOption = Parameters<typeof ML.with_temporal_bucket>[1];
type TemporalBucketObjectOption = Extract<
  TemporalBucketOption,
  { type: "temporal-bucketing" | "binning" }
>;

function isTemporalBucketTarget(
  column: ColumnMetadata | BreakoutClause,
): column is TemporalBucketTarget {
  return (
    Array.isArray(column) || (typeof column === "object" && column != null)
  );
}

export function temporalBucket(
  column: ColumnMetadata | BreakoutClause,
): Bucket | null {
  if (!isTemporalBucketTarget(column)) {
    return null;
  }
  return ML.temporal_bucket(column);
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
  bucket: Bucket | BucketOption | null,
): ColumnMetadata;
export function withTemporalBucket(
  column: BreakoutClause,
  bucket: Bucket | BucketOption | null,
): BreakoutClause;
export function withTemporalBucket(
  column: ColumnMetadata | BreakoutClause,
  bucket: Bucket | BucketOption | null,
): ColumnMetadata | BreakoutClause {
  if (!isTemporalBucketTarget(column)) {
    return column;
  }
  return ML.with_temporal_bucket(column, normalizeTemporalBucketOption(bucket));
}

function normalizeTemporalBucketOption(
  bucket: Bucket | BucketOption | null,
): TemporalBucketOption {
  if (bucket == null) {
    return null;
  }
  if (typeof bucket === "string") {
    return bucket;
  }
  if (isTemporalBucketObjectOption(bucket)) {
    return bucket;
  }
  return null;
}

function isTemporalBucketObjectOption(
  bucket: Bucket | BucketOption,
): bucket is TemporalBucketObjectOption {
  return (
    typeof bucket === "object" &&
    bucket != null &&
    "type" in bucket &&
    (bucket.type === "temporal-bucketing" || bucket.type === "binning")
  );
}

export function withDefaultTemporalBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): ColumnMetadata {
  const defaultBucket = defaultTemporalBucket(query, stageIndex, column);
  return defaultBucket ? withTemporalBucket(column, defaultBucket) : column;
}

export function defaultTemporalBucket(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Bucket | null {
  const buckets = availableTemporalBuckets(query, stageIndex, column);
  const defaultBucket = buckets.find(
    (bucket) => displayInfo(query, stageIndex, bucket).default,
  );

  return defaultBucket ?? null;
}

type IntervalAmount = number | "current" | "next" | "last";

export function describeTemporalInterval(
  n: IntervalAmount,
  unit?: TemporalUnit,
  opts?: { "include-current"?: boolean },
): string {
  return ML.describe_temporal_interval(n, unit, opts);
}

export function describeRelativeDatetime(
  n: IntervalAmount,
  unit?: TemporalUnit,
): string {
  return ML.describe_relative_datetime(n, unit);
}

type RelativeDateRangeFormatOpts = {
  value: number | "current";
  unit: TemporalUnit;
  offsetValue?: number;
  offsetUnit?: TemporalUnit;
  includeCurrent?: boolean;
};

export function formatRelativeDateRange({
  value,
  unit,
  offsetValue,
  offsetUnit,
  includeCurrent,
}: RelativeDateRangeFormatOpts): string {
  return ML.format_relative_date_range(value, unit, offsetValue, offsetUnit, {
    "include-current": includeCurrent,
  });
}

export function availableTemporalUnits(): TemporalUnit[] {
  return ML.available_temporal_units();
}
