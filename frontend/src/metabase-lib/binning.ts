import * as ML from "cljs/metabase.lib.js";

import { displayInfo } from "./metadata";
import type { Bucket, ColumnMetadata, Clause, Query } from "./types";

export function binning(clause: Clause | ColumnMetadata): Bucket | null {
  return ML.binning(clause);
}

export function availableBinningStrategies(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): Bucket[] {
  return ML.available_binning_strategies(query, stageIndex, column);
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
  binningStrategy: Bucket | null,
): ColumnMetadata {
  return ML.with_binning(column, binningStrategy);
}

export function withDefaultBinning(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): ColumnMetadata {
  const buckets = availableBinningStrategies(query, stageIndex, column);
  const defaultBucket = buckets.find(
    bucket => displayInfo(query, stageIndex, bucket).default,
  );
  return defaultBucket ? withBinning(column, defaultBucket) : column;
}
