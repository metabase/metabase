import type { SourceColorMap } from "metabase/metrics-viewer/types/viewer-state";
import type { DefinitionSource } from "metabase/metrics-viewer/utils/definition-sources";
import {
  getDefinitionSourceIcon,
  getDefinitionSourceName,
} from "metabase/metrics-viewer/utils/definition-sources";
import * as LibMetric from "metabase-lib/metric";

import type { DimensionListItem, DimensionSection, MetricGroup } from "./types";

export function getMetricGroups(
  definitionSources: DefinitionSource[],
  metricColors: SourceColorMap,
): MetricGroup[] {
  return definitionSources.map((definitionSource, definitionIndex) => {
    const definition = definitionSource.definition;
    const dimensions = LibMetric.filterableDimensions(definition);

    const byGroupId = new Map<
      string,
      { groupName: string; items: DimensionListItem[] }
    >();

    for (const dimension of dimensions) {
      const info = LibMetric.displayInfo(definition, dimension);
      const groupId = info.group?.id ?? "";
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
      id: definitionSource.index,
      metricName: getDefinitionSourceName(definitionSource),
      metricCount: definitionSource.token?.count,
      icon: getDefinitionSourceIcon(definitionSource),
      colors: metricColors[definitionSource.entityIndex],
      sections,
    };
  });
}
