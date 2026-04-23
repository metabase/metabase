import { t } from "ttag";

import type { IconName } from "metabase/ui";
import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerTabType,
} from "../types/viewer-state";

import type { MetricSlot } from "./metric-slots";
import { type TabInfo, getDimensionIcon, getDimensionsByType } from "./tabs";

// ── Dimension picker ──

export interface AvailableDimension {
  icon: IconName;
  group?: DimensionGroup;
  tabInfo: TabInfo;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

interface DimensionEntry {
  dimension: DimensionMetadata;
  id: string;
  label: string;
  icon: IconName;
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
  sourceId: MetricSourceId;
}

function collectAllDimensionEntries(
  sourceOrder: MetricSourceId[],
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  existingTabDimensionIds: Set<string>,
): DimensionEntry[] {
  const entries: DimensionEntry[] = [];

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    for (const [id, info] of getDimensionsByType(def)) {
      if (existingTabDimensionIds.has(id)) {
        continue;
      }

      entries.push({
        dimension: info.dimensionMetadata,
        id,
        label: info.displayName,
        icon: getDimensionIcon(info.dimensionMetadata),
        tabType: info.dimensionType,
        group: info.group,
        sourceId,
      });
    }
  }

  return entries;
}

function groupBySource(entries: DimensionEntry[]): DimensionEntry[][] {
  const groups: DimensionEntry[][] = [];
  const groupKeys: DimensionEntry[] = [];

  for (const entry of entries) {
    const groupIndex = groupKeys.findIndex((key) =>
      LibMetric.isSameSource(key.dimension, entry.dimension),
    );
    if (groupIndex !== -1) {
      groups[groupIndex].push(entry);
    } else {
      groupKeys.push(entry);
      groups.push([entry]);
    }
  }

  return groups;
}

export function getAvailableDimensionsForPicker(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
  metricSlots: MetricSlot[],
  existingTabDimensionIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = { shared: [], bySource: {} };

  if (sourceOrder.length === 0) {
    return result;
  }

  const entries = collectAllDimensionEntries(
    sourceOrder,
    definitionsBySourceId,
    existingTabDimensionIds,
  );
  const groups = groupBySource(entries);
  const loadedSourceCount = new Set(entries.map((entry) => entry.sourceId))
    .size;
  const hasMultipleSources = loadedSourceCount > 1;

  const sourceIdToSlotIndices = metricSlots.reduce(
    (acc, slot) => {
      if (acc[slot.sourceId]) {
        acc[slot.sourceId].push(slot.slotIndex);
      } else {
        acc[slot.sourceId] = [slot.slotIndex];
      }
      return acc;
    },
    {} as Record<MetricSourceId, number[]>,
  );

  for (const group of groups) {
    const uniqueSources = [...new Set(group.map((entry) => entry.sourceId))];
    const first = group[0];

    if (hasMultipleSources && uniqueSources.length >= 2) {
      result.shared.push({
        icon: first.icon,
        group: first.group,
        tabInfo: {
          type: first.tabType,
          label: first.label,
          dimensionMapping: Object.fromEntries(
            group.flatMap((entry) =>
              (sourceIdToSlotIndices[entry.sourceId] ?? []).map((slotIndex) => [
                slotIndex,
                entry.id,
              ]),
            ),
          ),
        },
      });
    } else {
      for (const entry of group) {
        const arr = (result.bySource[entry.sourceId] ??= []);
        arr.push({
          icon: entry.icon,
          group: entry.group,
          tabInfo: {
            type: entry.tabType,
            label: entry.label,
            dimensionMapping: Object.fromEntries(
              (sourceIdToSlotIndices[entry.sourceId] ?? []).map((slotIndex) => [
                slotIndex,
                entry.id,
              ]),
            ),
          },
        });
      }
    }
  }

  result.shared.sort((first, second) =>
    first.tabInfo.label.localeCompare(second.tabInfo.label),
  );
  for (const sourceId of sourceOrder) {
    result.bySource[sourceId]?.sort((first, second) =>
      first.tabInfo.label.localeCompare(second.tabInfo.label),
    );
  }

  return result;
}

// ── Display helpers ──

export interface SourceDisplayInfo {
  type: "metric" | "measure";
  name: string;
}

// ── Dimension picker sections ──

export type DimensionPickerItem = AvailableDimension & {
  name: string;
};

export type DimensionPickerSection = {
  name?: string;
  items: DimensionPickerItem[];
};

export function buildDimensionPickerSections({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
}): DimensionPickerSection[] {
  const sections: DimensionPickerSection[] = [];

  const splitByGroup = (
    dimensions: AvailableDimension[],
    sectionName?: string,
  ) => {
    const groups = new Map<string | undefined, AvailableDimension[]>();
    for (const dimension of dimensions) {
      const groupId = dimension.group?.id;
      const existing = groups.get(groupId);
      if (existing) {
        existing.push(dimension);
      } else {
        groups.set(groupId, [dimension]);
      }
    }

    if (groups.size <= 1) {
      sections.push({
        name: sectionName,
        items: dimensions.map((dimension) => ({
          ...dimension,
          name: dimension.tabInfo.label,
        })),
      });
      return;
    }

    for (const [, groupDimensions] of groups) {
      const groupName = groupDimensions[0].group?.displayName;
      const name = sectionName ? `${sectionName} · ${groupName}` : groupName;
      sections.push({
        name,
        items: groupDimensions.map((dimension) => ({
          ...dimension,
          name: dimension.tabInfo.label,
        })),
      });
    }
  };

  if (hasMultipleSources && availableDimensions.shared.length > 0) {
    splitByGroup(availableDimensions.shared, t`Shared`);
  }

  for (const sourceId of sourceOrder) {
    const sourceDimensions = availableDimensions.bySource[sourceId];
    if (!sourceDimensions || sourceDimensions.length === 0) {
      continue;
    }

    if (hasMultipleSources) {
      const sourceName = sourceDataById[sourceId]?.name ?? sourceId;
      splitByGroup(sourceDimensions, sourceName);
    } else {
      splitByGroup(sourceDimensions);
    }
  }

  return sections;
}
