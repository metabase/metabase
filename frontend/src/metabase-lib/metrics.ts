import * as ML from "cljs/metabase.lib.js";

import type { MetricMetadata, Query } from "./types";

export function availableMetrics(query: Query): MetricMetadata[] {
  return ML.available_metrics(query);
}
