import * as ML from "cljs/metabase.lib.js";

import type { MetricMetadata, Query } from "./types";

export function availableMetrics(
  query: Query,
  stageIndex: number,
): MetricMetadata[] {
  return ML.available_metrics(query, stageIndex);
}

export function isMetricBased(query: Query, stageIndex: number): boolean {
  return ML.metric_based_QMARK_(query, stageIndex);
}
