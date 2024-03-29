import * as ML from "cljs/metabase.lib.js";
import type { MetricId } from "metabase-types/api";

import type { MetricMetadata, Query } from "./types";

export function availableMetrics(
  query: Query,
  stageIndex: number,
): MetricMetadata[] {
  return ML.available_metrics(query, stageIndex);
}

export function metricMetadata(
  query: Query,
  metricId: MetricId,
): MetricMetadata | null {
  return ML.metric_metadata(query, metricId);
}
