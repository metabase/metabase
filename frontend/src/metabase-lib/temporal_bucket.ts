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

export function temporalBucket(
  column: ColumnMetadata | BreakoutClause,
): Bucket | null {
  // CLJS core handles both columns and clauses via multimethod
  return ML.temporal_bucket(column as ColumnMetadata);
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
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket as Bucket | null);
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
  return ML.available_temporal_units() as TemporalUnit[];
}
