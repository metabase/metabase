import { t } from "ttag";

import * as LibMetric from "metabase-lib/metric";

import type { DimensionListItem, DimensionSection, MetricGroup } from "./types";

export function getMetricGroups(
  definitions: LibMetric.MetricDefinition[],
): MetricGroup[] {
  return definitions.map((definition, definitionIndex) => {
    const dimensions = LibMetric.filterableDimensions(definition);

    const byGroupId = new Map<
      string,
      { groupName: string; items: DimensionListItem[] }
    >();

    for (const dimension of dimensions) {
      const info = LibMetric.displayInfo(definition, dimension);
      const groupId = info.group?.id;
      const groupName = info.group?.displayName ?? "";
      const item: DimensionListItem = {
        name: info.displayName,
        definition,
        definitionIndex,
        dimension,
      };

      const entry = byGroupId.get(groupId);
      if (entry) {
        entry.items.push(item);
      } else {
        byGroupId.set(groupId, { groupName, items: [item] });
      }
    }

    const sections: DimensionSection[] = [];
    if (byGroupId.size <= 1) {
      const allItems = [...byGroupId.values()].flatMap((g) => g.items);
      sections.push({ items: allItems });
    } else {
      for (const [, { groupName, items }] of byGroupId) {
        sections.push({ name: groupName, items });
      }
    }

    return {
      metricName: getSectionName(definition),
      icon: getSectionIcon(definition),
      sections,
    };
  });
}

export function getSectionName(
  definition: LibMetric.MetricDefinition,
): string {
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
