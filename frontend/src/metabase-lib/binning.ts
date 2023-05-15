import * as ML from "cljs/metabase.lib.js";
import type { Bucket, ColumnMetadata, Clause, Query } from "./types";

export function binning(clause: Clause | ColumnMetadata): Bucket | null {
  return ML.binning(clause);
}

declare function AvailableBinningStrategiesFn(
  query: Query,
  column: ColumnMetadata,
): Bucket[];

declare function AvailableBinningStrategiesFn(
  query: Query,
  stageNumber: number,
  column: ColumnMetadata,
): Bucket[];

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const availableBinningStrategies: typeof AvailableBinningStrategiesFn = (
  ...args
) => {
  return ML.available_binning_strategies(...args) || [];
};

export function withBinning(column: ColumnMetadata, binningStrategy: Bucket) {
  return ML.with_binning(column, binningStrategy);
}
