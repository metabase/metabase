import * as ML from "cljs/metabase.lib.js";

import { Binning, BinningStrategy, ColumnMetadata, Query } from "./types";

export function binning(column: ColumnMetadata): Binning | null {
  return ML.binning(column);
}

declare function WithBinningFn(
  query: Query,
  column: ColumnMetadata,
  strategy: BinningStrategy | null,
): Query;

declare function WithBinningFn(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  strategy: BinningStrategy | null,
): Query;

export const withBinning: typeof WithBinningFn = ML.with_binning;

declare function AvailableBinningStrategiesFn(
  query: Query,
  column: ColumnMetadata,
): BinningStrategy[] | null;

declare function AvailableBinningStrategiesFn(
  query: Query,
  stageNumber: number,
  column: ColumnMetadata,
): BinningStrategy[] | null;

export const availableBinningStrategies: typeof AvailableBinningStrategiesFn =
  ML.available_binning_strategies;
