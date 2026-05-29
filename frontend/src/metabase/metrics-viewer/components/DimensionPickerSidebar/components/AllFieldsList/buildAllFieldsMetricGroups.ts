import type {
  MetricSourceId,
  SourceColorMap,
} from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import type { AllFieldsMetricGroup } from "./types";

function getSectionKey(section: DimensionPickerSection) {
  return section.name;
}

function getDimensionItemKey(item: DimensionPickerSection["items"][number]) {
  const entries = Object.entries(item.dimensionBreakoutInfo.dimensionMapping)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `${item.dimensionBreakoutInfo.type}:${entries}`;
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

function getSourceSlotIndices(
  metricSlots: MetricSlot[],
  sourceId: MetricSourceId,
) {
  return new Set(
    metricSlots
      .filter((slot) => slot.sourceId === sourceId)
      .map((slot) => slot.slotIndex),
  );
}

function scopeItemToSlotIndices(
  item: DimensionPickerItem,
  slotIndices: Set<number>,
) {
  const dimensionMapping = Object.fromEntries(
    Object.entries(item.dimensionBreakoutInfo.dimensionMapping).filter(
      ([slotIndex]) => slotIndices.has(Number(slotIndex)),
    ),
  );

  if (Object.keys(dimensionMapping).length === 0) {
    return null;
  }

  return {
    ...item,
    dimensionBreakoutInfo: {
      ...item.dimensionBreakoutInfo,
      dimensionMapping,
    },
  };
}

function scopeSectionsToSource(
  sections: DimensionPickerSection[],
  metricSlots: MetricSlot[],
  sourceId: MetricSourceId,
) {
  const slotIndices = getSourceSlotIndices(metricSlots, sourceId);

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => scopeItemToSlotIndices(item, slotIndices))
        .filter((item): item is DimensionPickerItem => item != null),
    }))
    .filter((section) => section.items.length > 0);
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
      const scopedSections = scopeSectionsToSource(
        matchingSections,
        metricSlots,
        sourceId,
      );

      return {
        key: sourceId,
        name: sourceDataById[sourceId]?.name ?? sourceId,
        colors:
          metricSlot != null ? sourceColors[metricSlot.entityIndex] : undefined,
        sections: mergeSectionsByName(scopedSections),
      };
    })
    .filter((group) => group.sections.length > 0);
}
