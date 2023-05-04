import { to_array } from "cljs/cljs.core";
import {
  available_binning_strategies,
  binning as _binning,
  with_binning,
} from "cljs/metabase.lib.core";
import type { Bucket, ColumnMetadata, Query } from "./types";

export function binning(query: Query, column: ColumnMetadata): Bucket | null {
  return _binning(query, column);
}

export function availableBinningStrategies(
  query: Query,
  column: ColumnMetadata,
): Bucket[] {
  return to_array(available_binning_strategies(query, column));
}

export function withBinning(column: ColumnMetadata, binningStrategy: Bucket) {
  return with_binning(column, binningStrategy);
}
