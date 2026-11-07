import { createMockMetadata } from "__support__/metadata";
import type { JsMetadata } from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
import type { NormalizedMetric } from "metabase-types/api";

export function createMetricMetadata(metrics: NormalizedMetric[]): JsMetadata {
  return {
    ...createMockMetadata(),
    metrics: Object.fromEntries(metrics.map((metric) => [metric.id, metric])),
  };
}

export function setupDefinition(
  metadata: JsMetadata,
  metricId: number,
): LibMetric.MetricDefinition {
  const provider = LibMetric.metadataProvider(metadata);
  const metricMeta = LibMetric.metricMetadata(provider, metricId);
  if (!metricMeta) {
    throw new Error(`Metric ${metricId} not found`);
  }
  return LibMetric.fromMetricMetadata(provider, metricMeta);
}
