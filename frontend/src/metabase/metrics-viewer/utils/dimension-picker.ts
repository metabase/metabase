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

import { getDimensionIcon, getDimensionsByType } from "./tabs";

// ── Dimension picker ──

export interface AvailableDimension {
  dimensionId: string;
  label: string;
  icon: IconName;
  sourceIds: MetricSourceId[];
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
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
  existingTabIds: Set<string>,
): DimensionEntry[] {
  const entries: DimensionEntry[] = [];

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    for (const [id, info] of getDimensionsByType(def)) {
      if (existingTabIds.has(id)) {
        continue;
      }

      entries.push({
        dimension: info.dimension,
        id,
        label: info.displayName,
        icon: getDimensionIcon(info.dimension),
        tabType: info.type,
        group: info.group,
        sourceId,
      });
    }
  }

  return entries;
}

function groupBySource(entries: DimensionEntry[]): DimensionEntry[][] {
  const groups: DimensionEntry[][] = [];

  for (const entry of entries) {
    const match = groups.find((group) =>
      group.some((existing) =>
        LibMetric.isSameSource(existing.dimension, entry.dimension),
      ),
    );
    if (match) {
      match.push(entry);
    } else {
      groups.push([entry]);
    }
  }

  return groups;
}

export function getAvailableDimensionsForPicker(
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  sourceOrder: MetricSourceId[],
  existingTabIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = { shared: [], bySource: {} };

  if (sourceOrder.length === 0) {
    return result;
  }

  const entries = collectAllDimensionEntries(
    sourceOrder,
    definitionsBySourceId,
    existingTabIds,
  );
  const groups = groupBySource(entries);
  const loadedSourceCount = new Set(entries.map((entry) => entry.sourceId))
    .size;
  const hasMultipleSources = loadedSourceCount > 1;

  for (const group of groups) {
    const uniqueSources = [...new Set(group.map((entry) => entry.sourceId))];
    const first = group[0];

    if (hasMultipleSources && uniqueSources.length >= 2) {
      result.shared.push({
        dimensionId: first.id,
        label: first.label,
        icon: first.icon,
        tabType: first.tabType,
        sourceIds: uniqueSources,
        group: first.group,
      });
    } else {
      for (const entry of group) {
        const arr = (result.bySource[entry.sourceId] ??= []);
        arr.push({
          dimensionId: entry.id,
          label: entry.label,
          icon: entry.icon,
          tabType: entry.tabType,
          sourceIds: [entry.sourceId],
          group: entry.group,
        });
      }
    }
  }

  result.shared.sort((first, second) =>
    first.label.localeCompare(second.label),
  );
  for (const sourceId of sourceOrder) {
    result.bySource[sourceId]?.sort((first, second) =>
      first.label.localeCompare(second.label),
    );
  }

  return result;
}

// ── Display helpers ──

export interface SourceDisplayInfo {
  type: "metric" | "measure";
  name: string;
}

export function getSourceDisplayName(
  sourceId: MetricSourceId,
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>,
): string {
  return sourceDataById[sourceId]?.name ?? sourceId;
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
          name: dimension.label,
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
          name: dimension.label,
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
      const sourceName = getSourceDisplayName(sourceId, sourceDataById);
      splitByGroup(sourceDimensions, sourceName);
    } else {
      splitByGroup(sourceDimensions);
    }
  }

  return sections;
}
