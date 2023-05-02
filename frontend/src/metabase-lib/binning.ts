import { to_array } from "cljs/cljs.core";
import * as ML from "cljs/metabase.lib.core";
import type { BinningStrategy, ColumnMetadata, Query } from "./types";

export function binning(
  query: Query,
  column: ColumnMetadata,
): BinningStrategy | null {
  return ML.binning(query, column);
}

export function availableBinningStrategies(
  query: Query,
  column: ColumnMetadata,
): BinningStrategy[] {
  return to_array(ML.available_binning_strategies(query, column));
}

export function withBinning(
  column: ColumnMetadata,
  binningStrategy: BinningStrategy,
) {
  return ML.with_binning(column, binningStrategy);
}
