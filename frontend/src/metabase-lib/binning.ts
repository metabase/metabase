import * as ML from "cljs/metabase.lib.js";

import { displayInfo } from "./metadata";
import type {
  BreakoutClause,
  Bucket,
  BucketOption,
  ColumnMetadata,
  Query,
} from "./types";

type BinningTarget = Parameters<typeof ML.binning>[0];

function isBinningTarget(
  column: ColumnMetadata | BreakoutClause,
): column is BinningTarget {
  return (
    Array.isArray(column) || (typeof column === "object" && column != null)
  );
}

export function binning(
  column: ColumnMetadata | BreakoutClause,
): Bucket | null {
  if (!isBinningTarget(column)) {
    return null;
  }
  return ML.binning(column);
}

export function availableBinningStrategies(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): BucketOption[] {
  return ML.available_binning_strategies(query, stageIndex, column) || [];
}

export function isBinnable(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): boolean {
  return availableBinningStrategies(query, stageIndex, column).length > 0;
}

export function withBinning(
  column: ColumnMetadata,
  binningStrategy: Bucket | BucketOption | null,
): ColumnMetadata;
export function withBinning(
  column: BreakoutClause,
  binningStrategy: Bucket | BucketOption | null,
): BreakoutClause;
export function withBinning(
  column: ColumnMetadata | BreakoutClause,
  binningStrategy: Bucket | BucketOption | null,
): ColumnMetadata | BreakoutClause {
  if (!isBinningTarget(column)) {
    return column;
  }
  return ML.with_binning(column, binningStrategy);
}

export function withDefaultBinning(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): ColumnMetadata {
  const buckets = availableBinningStrategies(query, stageIndex, column);
  const defaultBucket = buckets.find(
    (bucket) => displayInfo(query, stageIndex, bucket).default,
  );
  return defaultBucket ? withBinning(column, defaultBucket) : column;
}
