import * as ML from "cljs/metabase.lib.js";
import type { TemporalUnit } from "metabase-types/api";

import { displayInfo } from "./metadata";
import type { Bucket, Clause, ColumnMetadata, Query } from "./types";

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
  bucket: Bucket | null,
): ColumnMetadata {
  return ML.with_temporal_bucket(column, bucket);
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
