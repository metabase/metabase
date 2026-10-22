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

function getSlotIndices(slotIndex: number) {
  return new Set([slotIndex]);
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
  slotIndices: Set<number>,
) {
  const items = sections.flatMap((section) =>
    section.items
      .map((item) => scopeItemToSlotIndices(item, slotIndices))
      .filter((item): item is DimensionPickerItem => item != null),
  );

  return items.length > 0 ? [{ items }] : [];
}

export function buildAllFieldsMetricGroups({
  sections,
  sourceDataById,
  metricSlots,
  sourceColors,
}: {
  sections: DimensionPickerSection[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  metricSlots: MetricSlot[];
  sourceColors: SourceColorMap;
}): AllFieldsMetricGroup[] {
  const uniqueSourceIds = [
    ...new Set(metricSlots.map((slot) => slot.sourceId)),
  ];
  const hasRepeatedSources = uniqueSourceIds.length < metricSlots.length;

  if (hasRepeatedSources) {
    return metricSlots
      .map((slot) => {
        const matchingSections = sections.filter(
          (section) =>
            section.isShared ||
            section.sourceId == null ||
            section.sourceId === slot.sourceId,
        );
        const scopedSections = scopeSectionsToSource(
          matchingSections,
          getSlotIndices(slot.slotIndex),
        );

        return {
          key: `${slot.slotIndex}:${slot.sourceId}`,
          name: sourceDataById[slot.sourceId]?.name ?? slot.sourceId,
          colors: sourceColors[slot.entityIndex],
          isExpressionToken: slot.tokenPosition != null,
          ...(slot.occurrenceCount != null
            ? { occurrenceCount: slot.occurrenceCount }
            : {}),
          sections: scopedSections,
        };
      })
      .filter((group) => group.sections.length > 0);
  }

  return uniqueSourceIds
    .map((sourceId) => {
      const sourceSlots = metricSlots.filter(
        (slot) => slot.sourceId === sourceId,
      );
      const metricSlot = sourceSlots[0];
      const matchingSections = sections.filter(
        (section) =>
          section.isShared ||
          section.sourceId == null ||
          section.sourceId === sourceId,
      );
      const scopedSections = scopeSectionsToSource(
        matchingSections,
        getSourceSlotIndices(metricSlots, sourceId),
      );

      return {
        key: sourceId,
        name: sourceDataById[sourceId]?.name ?? sourceId,
        colors:
          metricSlot != null ? sourceColors[metricSlot.entityIndex] : undefined,
        isExpressionToken: sourceSlots.every(
          (slot) => slot.tokenPosition != null,
        ),
        sections: scopedSections,
      };
    })
    .filter((group) => group.sections.length > 0);
}
