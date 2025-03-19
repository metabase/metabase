import * as ML from "cljs/metabase.lib.js";

import type { ColumnMetadata, MetricMetadata } from "./types";

export function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

export function isMetricMetadata(arg: unknown): arg is MetricMetadata {
  return ML.is_column_metadata(arg);
}
