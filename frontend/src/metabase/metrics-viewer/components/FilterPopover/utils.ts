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
    const segmentItemsByGroup = buildSegmentItemsByGroup(
      definition,
      definitionIndex,
    );
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

    const hasSegments = segmentItemsByGroup.size > 0;
    const sections = buildSections(byGroupId, segmentItemsByGroup);

    return {
      id: definitionSource.index,
      metricName: getDefinitionSourceName(definitionSource),
      metricCount: definitionSource.token?.count,
      icon: getDefinitionSourceIcon(definitionSource),
      colors: metricColors[definitionSource.entityIndex],
      sections,
      hasSegments,
    };
  });
}

function flattenSegmentBuckets(
  segmentItemsByGroup: Map<string, SegmentListItem[]>,
): SegmentListItem[] {
  const out: SegmentListItem[] = [];
  for (const bucket of segmentItemsByGroup.values()) {
    out.push(...bucket);
  }
  return out;
}

function buildSections(
  byGroupId: Map<string, DimensionBucket>,
  segmentItemsByGroup: Map<string, SegmentListItem[]>,
): MetricGroupFilterSection[] {
  // Clone so we can mark buckets as consumed without mutating the caller's map.
  const remainingSegments = new Map(segmentItemsByGroup);

  // No dimensions at all — if there are segments, still surface them
  // inside a single source-table section so they don't disappear.
  if (byGroupId.size === 0) {
    const allSegments = flattenSegmentBuckets(remainingSegments);
    if (allSegments.length > 0) {
      return [{ isSourceTable: true, items: allSegments }];
    }
    return [];
  }

  // Single-group fallback: merge every dimension + every segment bucket
  // into one unnamed section and treat it as the source table.
  if (byGroupId.size === 1) {
    const [{ items }] = [...byGroupId.values()];
    return [
      {
        isSourceTable: true,
        items: [...flattenSegmentBuckets(remainingSegments), ...items],
      },
    ];
  }

  // Multiple groups: place each segment in the section matching its own
  // dimension group (source or joined).
  const sections: MetricGroupFilterSection[] = [];
  let mainAttached = false;
  for (const [groupId, { groupName, groupType, items }] of byGroupId) {
    const isSourceTable = groupType === "main";
    const groupSegments = remainingSegments.get(groupId) ?? [];
    remainingSegments.delete(groupId);
    sections.push({
      name: groupName,
      isSourceTable,
      items: groupSegments.length > 0 ? [...groupSegments, ...items] : items,
    });
    if (isSourceTable) {
      mainAttached = true;
    }
  }

  // Leftovers: segments whose group id didn't match any dimension group
  // (defensive — shouldn't normally happen since segments come with a
  // group pulled from the same dimension set). Prefer appending them to
  // the existing source-table section; otherwise synthesize one so they
  // don't disappear.
  const leftovers = flattenSegmentBuckets(remainingSegments);
  if (leftovers.length > 0) {
    if (mainAttached) {
      const sourceIndex = sections.findIndex((s) => s.isSourceTable);
      if (sourceIndex >= 0) {
        const source = sections[sourceIndex];
        sections[sourceIndex] = {
          ...source,
          items: [...leftovers, ...(source.items ?? [])],
        };
      }
    } else {
      sections.unshift({ isSourceTable: true, items: leftovers });
    }
  }

  return sections;
}

function buildSegmentItemsByGroup(
  definition: MetricDefinition,
  definitionIndex: number,
): Map<string, SegmentListItem[]> {
  const byGroupId = new Map<string, SegmentListItem[]>();
  for (const segment of LibMetric.availableSegments(definition)) {
    const info = LibMetric.displayInfo(definition, segment);
    const groupId = info.group?.id ?? "";
    const item: SegmentListItem = {
      name: info.displayName,
      definition,
      definitionIndex,
      segment,
    };
    const bucket = byGroupId.get(groupId);
    if (bucket) {
      bucket.push(item);
    } else {
      byGroupId.set(groupId, [item]);
    }
  }
  return byGroupId;
}
