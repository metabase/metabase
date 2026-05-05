import type { IconName } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

export function getMetricLabel(
  definition: LibMetric.MetricDefinition,
): string | undefined {
  const metricId = LibMetric.sourceMetricId(definition);
  if (metricId != null) {
    const metric = LibMetric.metricMetadata(definition, metricId);
    const metricInfo =
      metric != null ? LibMetric.displayInfo(definition, metric) : null;
    return metricInfo?.displayName;
  }

  const measureId = LibMetric.sourceMeasureId(definition);
  if (measureId != null) {
    const measure = LibMetric.measureMetadata(definition, measureId);
    const measureInfo =
      measure != null ? LibMetric.displayInfo(definition, measure) : null;
    return measureInfo?.displayName;
  }
}

export function getMetricIcon(
  definition: LibMetric.MetricDefinition,
): IconName {
  const metricId = LibMetric.sourceMetricId(definition);
  if (metricId != null) {
    return "metric";
  }
  const measureId = LibMetric.sourceMeasureId(definition);
  if (measureId != null) {
    return "ruler";
  }
  return "unknown";
}
