import { to_array } from "cljs/cljs.core";
import * as ML from "cljs/metabase.lib.core";
import type { Bucket, ColumnMetadata, Query } from "./types";

export function binning(query: Query, column: ColumnMetadata): Bucket | null {
  return ML.binning(query, column);
}

export function availableBinningStrategies(
  query: Query,
  column: ColumnMetadata,
): Bucket[] {
  return to_array(ML.available_binning_strategies(query, column));
}

export function withBinning(column: ColumnMetadata, binningStrategy: Bucket) {
  return ML.with_binning(column, binningStrategy);
}
