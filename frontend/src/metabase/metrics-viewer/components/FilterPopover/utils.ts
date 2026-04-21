import type {
  DimensionListItem,
  MetricGroup,
  MetricGroupFilterSection,
  SegmentListItem,
} from "metabase/metrics-viewer/components/FilterPopover/types";
import type { SourceColorMap } from "metabase/metrics-viewer/types";
import {
  type DefinitionSource,
  getDefinitionSourceIcon,
  getDefinitionSourceName,
} from "metabase/metrics-viewer/utils/definition-sources";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

type NamedItem = { name: string };

type SectionWithItems<TItem extends NamedItem> = {
  items?: TItem[];
  [key: string]: unknown;
};

type GroupWithSections<TItem extends NamedItem> = {
  sections: SectionWithItems<TItem>[];
  [key: string]: unknown;
};

export function filterDisplayGroupsBySearch<
  TItem extends NamedItem,
  TGroup extends GroupWithSections<TItem>,
>(displayGroups: TGroup[], searchText: string): TGroup[] | null {
  if (!searchText.trim()) {
    return null;
  }
  const lowerSearch = searchText.toLowerCase();
  return displayGroups
    .map((group) => {
      const filteredSections = group.sections
        .map((section) => ({
          ...section,
          items: section.items?.filter((item) =>
            item.name.toLowerCase().includes(lowerSearch),
          ),
        }))
        .filter((section) => section.items && section.items.length > 0);

      return {
        ...group,
        sections: filteredSections,
      };
    })
    .filter((group) => group.sections.length > 0);
}

type DimensionBucket = {
  groupName: string;
  groupType: "main" | "connection" | undefined;
  items: DimensionListItem[];
};

export function getMetricGroups(
  definitionSources: DefinitionSource[],
  metricColors: SourceColorMap,
): MetricGroup[] {
  return definitionSources.map((definitionSource, definitionIndex) => {
    const definition = definitionSource.definition;
    const segmentItems = buildSegmentItems(definition, definitionIndex);
    const dimensions = LibMetric.filterableDimensions(definition);

    const byGroupId = new Map<string, DimensionBucket>();

    for (const dimension of dimensions) {
      const info = LibMetric.displayInfo(definition, dimension);
      const groupId = info.group?.id ?? "";
      const groupName = info.group?.displayName ?? "";
      const groupType = info.group?.type;
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
        byGroupId.set(groupId, { groupName, groupType, items: [item] });
      }
    }

    const sections = buildSections(byGroupId, segmentItems);

    return {
      id: definitionSource.index,
      metricName: getDefinitionSourceName(definitionSource),
      metricCount: definitionSource.token?.count,
      icon: getDefinitionSourceIcon(definitionSource),
      colors: metricColors[definitionSource.entityIndex],
      sections,
      hasSegments: segmentItems.length > 0,
    };
  });
}

function buildSections(
  byGroupId: Map<string, DimensionBucket>,
  segmentItems: SegmentListItem[],
): MetricGroupFilterSection[] {
  // No dimensions at all — if there are segments, still surface them
  // inside a single source-table section so they don't disappear.
  if (byGroupId.size === 0) {
    if (segmentItems.length > 0) {
      return [{ isSourceTable: true, items: [...segmentItems] }];
    }
    return [];
  }

  // Single-group fallback: merge everything into one unnamed section and
  // treat it as the source table so segments land on top.
  if (byGroupId.size === 1) {
    const [{ items }] = [...byGroupId.values()];
    return [{ isSourceTable: true, items: [...segmentItems, ...items] }];
  }

  // Multiple groups: segments only belong to the main (source-table) group.
  const sections: MetricGroupFilterSection[] = [];
  let mainAttached = false;
  for (const [, { groupName, groupType, items }] of byGroupId) {
    const isSourceTable = groupType === "main";
    sections.push({
      name: groupName,
      isSourceTable,
      items:
        isSourceTable && segmentItems.length > 0
          ? [...segmentItems, ...items]
          : items,
    });
    if (isSourceTable) {
      mainAttached = true;
    }
  }

  // Safety net: if no group reported itself as "main" but we have
  // segments, synthesize a source-table section for them rather than
  // silently dropping them.
  if (!mainAttached && segmentItems.length > 0) {
    sections.unshift({ isSourceTable: true, items: [...segmentItems] });
  }

  return sections;
}

function buildSegmentItems(
  definition: MetricDefinition,
  definitionIndex: number,
): SegmentListItem[] {
  const segments = LibMetric.availableSegments(definition);
  return segments.map((segment) => {
    const info = LibMetric.displayInfo(definition, segment);
    return {
      name: info.displayName,
      definition,
      definitionIndex,
      segment,
    };
  });
}
