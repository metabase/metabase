import { t } from "ttag";

import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerTabState,
  MetricsViewerTabType,
  SourceColorMap,
} from "../types/viewer-state";

import type { MetricSlot } from "./metric-slots";
import { type TabInfo, getDimensionIcon, getDimensionsByType } from "./tabs";

// ── Dimension picker ──

export interface AvailableDimension {
  icon: IconName;
  group?: DimensionGroup;
  canListValues?: boolean;
  isPreferred?: boolean;
  tabInfo: TabInfo;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

export function getExistingTabDimensionIds(
  tabs: MetricsViewerTabState[],
  excludedTabId?: string | null,
) {
  return new Set(
    tabs
      .filter((tab) => tab.id !== excludedTabId)
      .flatMap((tab) => Object.values(tab.dimensionMapping))
      .filter((id) => id != null),
  );
}

interface DimensionEntry {
  dimension: DimensionMetadata;
  id: string;
  label: string;
  icon: IconName;
  tabType: MetricsViewerTabType;
  group?: DimensionGroup;
  canListValues: boolean;
  isPreferred?: boolean;
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
        canListValues: info.canListValues,
        isPreferred: info.isPreferred,
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

  const sourceIdToSlotIndices: Record<MetricSourceId, number[]> = {};
  for (const slot of metricSlots) {
    const slotIndices = (sourceIdToSlotIndices[slot.sourceId] ??= []);
    slotIndices.push(slot.slotIndex);
  }

  for (const group of groups) {
    const uniqueSources = [...new Set(group.map((entry) => entry.sourceId))];
    const first = group[0];

    if (hasMultipleSources && uniqueSources.length >= 2) {
      result.shared.push({
        icon: first.icon,
        group: first.group,
        canListValues: first.canListValues,
        isPreferred: first.isPreferred,
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
          canListValues: entry.canListValues,
          isPreferred: entry.isPreferred,
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

export type DimensionPickerSidebarCategory = DimensionPickerItem & {
  key: string;
  targetItems: DimensionPickerItem[];
};

export type DimensionPickerSidebarCategorySelectOption = {
  value: string;
  label: string;
  icon: IconName;
};

type RawDimensionPickerSidebarCategorySelectOption =
  DimensionPickerSidebarCategorySelectOption & {
    groupName?: string;
  };

export type DimensionPickerSidebarCategorySelectRow = {
  slotIndex: number;
  sourceId: MetricSourceId;
  metricName: string;
  colors?: string[];
  value: string | null;
  options: DimensionPickerSidebarCategorySelectOption[];
};

export type DimensionPickerSection = {
  name?: string;
  items: DimensionPickerItem[];
  isShared?: boolean;
  sourceId?: MetricSourceId;
};

function getDimensionPickerSectionName(
  sectionName: string | undefined,
  groupName: string | undefined,
  metadata: Pick<DimensionPickerSection, "isShared" | "sourceId">,
) {
  if ((metadata.isShared || metadata.sourceId) && groupName) {
    return groupName;
  }

  if (sectionName && groupName) {
    return `${sectionName} · ${groupName}`;
  }

  return sectionName ?? groupName;
}

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
    metadata: Pick<DimensionPickerSection, "isShared" | "sourceId"> = {},
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
      const groupName = dimensions[0]?.group?.displayName;
      sections.push({
        name: getDimensionPickerSectionName(sectionName, groupName, metadata),
        ...metadata,
        items: dimensions.map((dimension) => ({
          ...dimension,
          name: dimension.tabInfo.label,
        })),
      });
      return;
    }

    for (const [, groupDimensions] of groups) {
      const groupName = groupDimensions[0].group?.displayName;
      sections.push({
        name: getDimensionPickerSectionName(sectionName, groupName, metadata),
        ...metadata,
        items: groupDimensions.map((dimension) => ({
          ...dimension,
          name: dimension.tabInfo.label,
        })),
      });
    }
  };

  if (hasMultipleSources && availableDimensions.shared.length > 0) {
    splitByGroup(availableDimensions.shared, t`Shared`, { isShared: true });
  }

  for (const sourceId of sourceOrder) {
    const sourceDimensions = availableDimensions.bySource[sourceId];
    if (!sourceDimensions || sourceDimensions.length === 0) {
      continue;
    }

    if (hasMultipleSources) {
      const sourceName = sourceDataById[sourceId]?.name ?? sourceId;
      splitByGroup(sourceDimensions, sourceName, { sourceId });
    } else {
      splitByGroup(sourceDimensions);
    }
  }

  return sections;
}

function mergeDimensionMappings(items: DimensionPickerItem[]) {
  const mapping: Record<number, string> = {};

  for (const item of items) {
    for (const [slotIndex, dimensionId] of Object.entries(
      item.tabInfo.dimensionMapping,
    )) {
      mapping[Number(slotIndex)] ??= dimensionId;
    }
  }

  return mapping;
}

function buildSidebarCategory(
  key: string,
  name: string,
  items: DimensionPickerItem[],
): DimensionPickerSidebarCategory {
  const first = items[0];

  return {
    ...first,
    key,
    name,
    targetItems: items,
    tabInfo: {
      ...first.tabInfo,
      label: name,
      dimensionMapping: mergeDimensionMappings(items),
    },
  };
}

function shouldShowInDefaultSidebar(item: DimensionPickerItem) {
  if (item.tabInfo.type === "numeric") {
    return false;
  }

  if (item.tabInfo.type === "category") {
    return item.isPreferred !== false;
  }

  return true;
}

const SIDEBAR_CATEGORY_ORDER: MetricsViewerTabType[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
  "scalar",
];

function sortSidebarCategories(
  first: DimensionPickerSidebarCategory,
  second: DimensionPickerSidebarCategory,
) {
  const typeDiff =
    SIDEBAR_CATEGORY_ORDER.indexOf(first.tabInfo.type) -
    SIDEBAR_CATEGORY_ORDER.indexOf(second.tabInfo.type);

  if (typeDiff !== 0) {
    return typeDiff;
  }

  return first.name.localeCompare(second.name);
}

export function buildDimensionPickerSidebarCategories({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  hasMultipleSources,
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  hasMultipleSources: boolean;
}): DimensionPickerSidebarCategory[] {
  const sections = buildDimensionPickerSections({
    availableDimensions,
    sourceOrder,
    sourceDataById,
    hasMultipleSources,
  });
  const items = sections
    .flatMap((section) => section.items)
    .filter(shouldShowInDefaultSidebar);
  const categories: DimensionPickerSidebarCategory[] = [];
  const groupedItems = new Map<string, DimensionPickerItem[]>();

  for (const item of items) {
    const key =
      item.tabInfo.type === "time"
        ? "type:time"
        : `${item.tabInfo.type}:${item.name}`;
    const existing = groupedItems.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groupedItems.set(key, [item]);
    }
  }

  for (const [key, categoryItems] of groupedItems) {
    const first = categoryItems[0];
    const name = first.tabInfo.type === "time" ? t`Time` : first.name;
    categories.push(buildSidebarCategory(key, name, categoryItems));
  }

  return categories.sort(sortSidebarCategories);
}

export function buildDimensionPickerSidebarCategorySelectRows({
  category,
  activeTab,
  metricSlots,
  sourceDataById,
  sourceColors,
}: {
  category: DimensionPickerSidebarCategory;
  activeTab: MetricsViewerTabState;
  metricSlots: MetricSlot[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  sourceColors: SourceColorMap;
}): DimensionPickerSidebarCategorySelectRow[] {
  return metricSlots.flatMap((slot) => {
    const optionsByValue = new Map<
      string,
      RawDimensionPickerSidebarCategorySelectOption
    >();

    for (const item of category.targetItems) {
      const dimensionId = item.tabInfo.dimensionMapping[slot.slotIndex];
      if (!dimensionId || optionsByValue.has(dimensionId)) {
        continue;
      }

      optionsByValue.set(dimensionId, {
        value: dimensionId,
        label: item.name,
        icon: item.icon,
        groupName: item.group?.displayName,
      });
    }

    const labelCounts = new Map<string, number>();
    for (const option of optionsByValue.values()) {
      labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
    }
    const fallbackGroupName =
      sourceDataById[slot.sourceId]?.name ?? slot.sourceId;
    const options = [...optionsByValue.values()]
      .map(({ groupName, ...option }) => ({
        ...option,
        label:
          (labelCounts.get(option.label) ?? 0) > 1
            ? `${groupName ?? fallbackGroupName} -> ${option.label}`
            : option.label,
      }))
      .sort((first, second) => first.label.localeCompare(second.label));
    if (options.length === 0) {
      return [];
    }

    const activeDimensionId =
      activeTab.dimensionMapping[slot.slotIndex] ?? null;

    return [
      {
        slotIndex: slot.slotIndex,
        sourceId: slot.sourceId,
        metricName: sourceDataById[slot.sourceId]?.name ?? slot.sourceId,
        colors: sourceColors[slot.entityIndex],
        value: options.some((option) => option.value === activeDimensionId)
          ? activeDimensionId
          : null,
        options,
      },
    ];
  });
}
