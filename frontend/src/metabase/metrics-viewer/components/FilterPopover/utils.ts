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

export function getMetricGroups(
  definitionSources: DefinitionSource[],
  metricColors: SourceColorMap,
): MetricGroup[] {
  return definitionSources.map((definitionSource, definitionIndex) => {
    const definition = definitionSource.definition;
    const segmentItems = buildSegmentItems(definition, definitionIndex);
    const dimensionItems = LibMetric.filterableDimensions(definition).map(
      (dimension): DimensionListItem => {
        const info = LibMetric.displayInfo(definition, dimension);
        return {
          name: info.displayName,
          definition,
          definitionIndex,
          dimension,
        };
      },
    );

    const hasSegments = segmentItems.length > 0;
    const items = [...segmentItems, ...dimensionItems];
    const sections: MetricGroupFilterSection[] =
      items.length > 0 ? [{ items }] : [];

    return {
      id: definitionSource.index,
      metricName: getDefinitionSourceName(definitionSource),
      metricCount: definitionSource.token?.occurrenceCount,
      icon: getDefinitionSourceIcon(definitionSource),
      colors: metricColors[definitionSource.entityIndex],
      sections,
      hasSegments,
    };
  });
}

function buildSegmentItems(
  definition: MetricDefinition,
  definitionIndex: number,
): SegmentListItem[] {
  const items: SegmentListItem[] = [];
  for (const segment of LibMetric.availableSegments(definition)) {
    const info = LibMetric.displayInfo(definition, segment);
    items.push({
      name: info.displayName,
      definition,
      definitionIndex,
      segment,
    });
  }
  return items;
}
