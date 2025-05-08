import { available_metrics } from "cljs/metabase.lib.js";

import type { MetricMetadata, Query } from "./types";

export function availableMetrics(
  query: Query,
  stageIndex: number,
): MetricMetadata[] {
  return available_metrics(query, stageIndex);
}
