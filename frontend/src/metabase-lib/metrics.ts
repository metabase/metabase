import * as ML from "cljs/metabase.lib.js";
import type { MetricId } from "metabase-types/api";

import type { LegacyMetricMetadata, Query } from "./types";

export function availableLegacyMetrics(
  query: Query,
  stageIndex: number,
): LegacyMetricMetadata[] {
  return ML.available_legacy_metrics(query, stageIndex);
}

export function legacyMetricMetadata(
  query: Query,
  metricId: MetricId,
): LegacyMetricMetadata | null {
  return ML.legacy_metric_metadata(query, metricId);
}
