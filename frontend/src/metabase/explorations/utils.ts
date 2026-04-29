import type { MetricBaseData } from "metabase-types/api";

export function isLibraryMetric(metric: {
  collection?: MetricBaseData["collection"];
}): boolean {
  return metric.collection?.type === "library-metrics";
}
