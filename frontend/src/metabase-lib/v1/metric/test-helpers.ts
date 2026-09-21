import * as LibMetric from "metabase-lib/metric";
import Metadata from "metabase-lib/v1/metadata/Metadata";
import type { NormalizedMetric } from "metabase-types/api";

export function createMetricMetadata(metrics: NormalizedMetric[]): Metadata {
  const metadata = new Metadata();
  for (const metric of metrics) {
    const { collection: _normalizedCollectionId, ...rest } = metric;
    metadata.metrics[metric.id] = { ...rest, collection: null };
  }
  return metadata;
}

export function setupDefinition(
  metadata: Metadata,
  metricId: number,
): LibMetric.MetricDefinition {
  const provider = LibMetric.metadataProvider(metadata);
  const metricMeta = LibMetric.metricMetadata(provider, metricId);
  if (!metricMeta) {
    throw new Error(`Metric ${metricId} not found`);
  }
  return LibMetric.fromMetricMetadata(provider, metricMeta);
}
