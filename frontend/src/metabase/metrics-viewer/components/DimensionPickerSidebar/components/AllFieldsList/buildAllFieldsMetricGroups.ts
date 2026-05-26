import type {
  MetricSourceId,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import type {
  DimensionPickerSection,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import type { AllFieldsMetricGroup } from "./types";

function getSectionKey(section: DimensionPickerSection) {
  return section.name;
}

function getDimensionItemKey(item: DimensionPickerSection["items"][number]) {
  const entries = Object.entries(item.tabInfo.dimensionMapping)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `${item.tabInfo.type}:${entries}`;
}

function mergeSectionsByName(sections: DimensionPickerSection[]) {
  const mergedSections: DimensionPickerSection[] = [];
  const sectionIndexesByKey = new Map<string, number>();

  for (const section of sections) {
    const sectionKey = getSectionKey(section);

    if (sectionKey == null) {
      mergedSections.push({ ...section, items: [...section.items] });
      continue;
    }

    const sectionIndex = sectionIndexesByKey.get(sectionKey);

    if (sectionIndex == null) {
      sectionIndexesByKey.set(sectionKey, mergedSections.length);
      mergedSections.push({ ...section, items: [...section.items] });
      continue;
    }

    const mergedSection = mergedSections[sectionIndex];
    const existingItemKeys = new Set(
      mergedSection.items.map(getDimensionItemKey),
    );
    const newItems = section.items.filter(
      (item) => !existingItemKeys.has(getDimensionItemKey(item)),
    );

    if (newItems.length > 0) {
      mergedSections[sectionIndex] = {
        ...mergedSection,
        items: [...mergedSection.items, ...newItems],
      };
    }
  }

  return mergedSections;
}

export function buildAllFieldsMetricGroups({
  sections,
  sourceOrder,
  sourceDataById,
  metricSlots,
  sourceColors,
}: {
  sections: DimensionPickerSection[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  metricSlots: MetricSlot[];
  sourceColors: SourceColorMap;
}): AllFieldsMetricGroup[] {
  return sourceOrder
    .map((sourceId) => {
      const metricSlot = metricSlots.find((slot) => slot.sourceId === sourceId);

      const matchingSections = sections.filter(
        (section) => section.isShared || section.sourceId === sourceId,
      );

      return {
        key: sourceId,
        name: sourceDataById[sourceId]?.name ?? sourceId,
        colors:
          metricSlot != null ? sourceColors[metricSlot.entityIndex] : undefined,
        sections: mergeSectionsByName(matchingSections),
      };
    })
    .filter((group) => group.sections.length > 0);
}
