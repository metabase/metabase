import * as ML from "cljs/metabase.lib.js";

import { displayInfo } from "./metadata";
import type { Bucket, Clause, ColumnMetadata, Query } from "./types";

/**
 * Type representing a static binning strategy returned by numericBinningStrategies
 * or coordinateBinningStrategies. These are pre-defined binning options that don't
 * require a query context, used for content translation pattern matching.
 */
export type StaticBinningStrategy = {
  displayName: string;
  mbql?: {
    strategy?: string;
    numBins?: number;
    binWidth?: number;
  };
};

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
    (bucket) => displayInfo(query, stageIndex, bucket).default,
  );
  return defaultBucket ? withBinning(column, defaultBucket) : column;
}

/**
 * Returns the list of binning options for numeric fields.
 * These split the data evenly into a fixed number of bins (10, 50, 100).
 * Returns plain objects (not opaque Buckets) for use in pattern matching.
 */
export function numericBinningStrategies(): StaticBinningStrategy[] {
  return ML.numeric_binning_strategies();
}

/**
 * Returns the list of binning options for coordinate fields (latitude/longitude).
 * These split the data into ranges of a certain number of degrees.
 * Returns plain objects (not opaque Buckets) for use in pattern matching.
 */
export function coordinateBinningStrategies(): StaticBinningStrategy[] {
  return ML.coordinate_binning_strategies();
}
