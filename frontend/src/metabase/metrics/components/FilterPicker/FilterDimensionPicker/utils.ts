import { t } from "ttag";

import * as LibMetric from "metabase-lib/metric";

import type { DimensionListItem, DimensionSection } from "./types";

export function getSections(
  definitions: LibMetric.MetricDefinition[],
): DimensionSection[] {
  return definitions.map((definition, definitionIndex) => {
    const dimensions = LibMetric.filterableDimensions(definition);
    const items: DimensionListItem[] = dimensions.map((dimension) => ({
      name: getDimensionName(definition, dimension),
      definition,
      definitionIndex,
      dimension,
    }));

    return {
      name: getSectionName(definition),
      icon: getSectionIcon(definition),
      items,
    };
  });
}

export function getSectionName(definition: LibMetric.MetricDefinition): string {
  const metric = LibMetric.sourceMetricOrMeasureMetadata(definition);
  if (metric) {
    const metricInfo = LibMetric.displayInfo(definition, metric);
    return metricInfo.displayName;
  }
  return t`Unknown`;
}

export function getSectionIcon(
  definition: LibMetric.MetricDefinition,
): "metric" | "ruler" {
  const metricId = LibMetric.sourceMetricId(definition);
  return metricId != null ? "metric" : "ruler";
}

export function getDimensionName(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
): string {
  const dimensionInfo = LibMetric.displayInfo(definition, dimension);
  return dimensionInfo.displayName;
}
