import { t } from "ttag";

import {
  type GeoSubtype,
  getGeoSubtype,
} from "metabase/metrics/common/utils/dimension-types";
import type {
  DimensionGroup,
  DimensionMetadata,
  MetricDefinition,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerDimensionBreakoutType,
  SourceColorMap,
} from "../types";

import {
  type DimensionBreakoutInfo,
  getDimensionIcon,
  getDimensionsByType,
} from "./dimension-breakouts";
import type { MetricSlot } from "./metric-slots";

// ── Dimension picker ──

export interface AvailableDimension {
  icon: IconName;
  group?: DimensionGroup;
  canListValues?: boolean;
  isPreferred?: boolean;
  geoSubtype?: GeoSubtype | null;
  dimensionBreakoutInfo: DimensionBreakoutInfo;
}

export interface AvailableDimensionsResult {
  shared: AvailableDimension[];
  bySource: Record<MetricSourceId, AvailableDimension[]>;
}

export function getExistingDimensionBreakoutDimensionIds(
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[],

  excludedDimensionBreakoutId?: string | null,
) {
  return new Set(
    dimensionBreakouts
      .filter(
        (dimensionBreakout) =>
          dimensionBreakout.id !== excludedDimensionBreakoutId,
      )
      .flatMap((dimensionBreakout) =>
        Object.values(dimensionBreakout.dimensionMapping),
      )
      .filter((id) => id != null),
  );
}

interface DimensionEntry {
  dimension: DimensionMetadata;
  id: string;
  label: string;
  icon: IconName;
  dimensionBreakoutType: MetricsViewerDimensionBreakoutType;
  group?: DimensionGroup;
  canListValues: boolean;
  isPreferred?: boolean;
  geoSubtype?: GeoSubtype | null;
  sourceId: MetricSourceId;
}

function collectAllDimensionEntries(
  sourceOrder: MetricSourceId[],
  definitionsBySourceId: Record<MetricSourceId, MetricDefinition | null>,
  existingDimensionBreakoutDimensionIds: Set<string>,
): DimensionEntry[] {
  const entries: DimensionEntry[] = [];

  for (const sourceId of sourceOrder) {
    const def = definitionsBySourceId[sourceId];
    if (!def) {
      continue;
    }

    for (const [id, info] of getDimensionsByType(def)) {
      if (existingDimensionBreakoutDimensionIds.has(id)) {
        continue;
      }

      const geoSubtype = getGeoSubtype(info.dimensionMetadata);

      entries.push({
        dimension: info.dimensionMetadata,
        id,
        label: info.displayName,
        icon: getDimensionIcon(info.dimensionMetadata),
        dimensionBreakoutType: info.dimensionType,
        group: info.group,
        canListValues: info.canListValues,
        isPreferred: info.isPreferred,
        ...(geoSubtype ? { geoSubtype } : {}),
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
  existingDimensionBreakoutDimensionIds: Set<string>,
): AvailableDimensionsResult {
  const result: AvailableDimensionsResult = { shared: [], bySource: {} };

  if (sourceOrder.length === 0) {
    return result;
  }

  const entries = collectAllDimensionEntries(
    sourceOrder,
    definitionsBySourceId,
    existingDimensionBreakoutDimensionIds,
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
        ...(first.geoSubtype ? { geoSubtype: first.geoSubtype } : {}),
        dimensionBreakoutInfo: {
          type: first.dimensionBreakoutType,
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
          ...(entry.geoSubtype ? { geoSubtype: entry.geoSubtype } : {}),
          dimensionBreakoutInfo: {
            type: entry.dimensionBreakoutType,
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
    first.dimensionBreakoutInfo.label.localeCompare(
      second.dimensionBreakoutInfo.label,
    ),
  );
  for (const sourceId of sourceOrder) {
    result.bySource[sourceId]?.sort((first, second) =>
      first.dimensionBreakoutInfo.label.localeCompare(
        second.dimensionBreakoutInfo.label,
      ),
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
  isExpressionToken: boolean;
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
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
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
          name: dimension.dimensionBreakoutInfo.label,
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
          name: dimension.dimensionBreakoutInfo.label,
        })),
      });
    }
  };

  const hasMultipleSources = sourceOrder.length > 1;

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
      item.dimensionBreakoutInfo.dimensionMapping,
    )) {
      if (dimensionId != null) {
        mapping[Number(slotIndex)] ??= dimensionId;
      }
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
    dimensionBreakoutInfo: {
      ...first.dimensionBreakoutInfo,
      label: name,
      dimensionMapping: mergeDimensionMappings(items),
    },
  };
}

function shouldShowInDefaultSidebar(item: DimensionPickerItem) {
  if (item.dimensionBreakoutInfo.type === "numeric") {
    return false;
  }

  if (item.dimensionBreakoutInfo.type === "category") {
    return item.isPreferred !== false;
  }

  return true;
}

const SIDEBAR_CATEGORY_ORDER: MetricsViewerDimensionBreakoutType[] = [
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
    SIDEBAR_CATEGORY_ORDER.indexOf(first.dimensionBreakoutInfo.type) -
    SIDEBAR_CATEGORY_ORDER.indexOf(second.dimensionBreakoutInfo.type);

  if (typeDiff !== 0) {
    return typeDiff;
  }

  return first.name.localeCompare(second.name);
}

function getComparableDimensionKey(item: DimensionPickerItem) {
  const type = item.dimensionBreakoutInfo.type;

  if (type === "time") {
    return "type:time";
  }

  if (type === "geo" && item.geoSubtype === "country") {
    return "type:geo:country";
  }

  return [type, item.group?.id ?? "", item.name].join(":");
}

function getDimensionPickerItemByDimensionId(
  sections: DimensionPickerSection[],
) {
  const itemsByDimensionId = new Map<string, DimensionPickerItem>();

  for (const item of sections.flatMap((section) => section.items)) {
    for (const dimensionId of Object.values(
      item.dimensionBreakoutInfo.dimensionMapping,
    )) {
      if (dimensionId != null && !itemsByDimensionId.has(dimensionId)) {
        itemsByDimensionId.set(dimensionId, item);
      }
    }
  }

  return itemsByDimensionId;
}

function getSidebarCategoryName(item: DimensionPickerItem) {
  const type = item.dimensionBreakoutInfo.type;

  if (type === "time") {
    return t`Time`;
  }

  if (type === "geo" && item.geoSubtype === "country") {
    return t`Country`;
  }

  return item.name;
}

function hasMappingForEverySlot(
  category: DimensionPickerSidebarCategory,
  metricSlots: MetricSlot[],
) {
  return metricSlots.every(
    (slot) => category.dimensionBreakoutInfo.dimensionMapping[slot.slotIndex],
  );
}

export function getComparableDimensionMapping({
  item,
  sections,
  metricSlots,
  activeDimensionBreakout,
}: {
  item: DimensionPickerItem;
  sections: DimensionPickerSection[];
  metricSlots: MetricSlot[];
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
}): Record<number, string | null> {
  const comparableKey = getComparableDimensionKey(item);
  const slotIndices = new Set(metricSlots.map((slot) => slot.slotIndex));
  const mapping: Record<number, string | null> = Object.fromEntries(
    metricSlots.map((slot) => [slot.slotIndex, null]),
  );
  const clickedSlotIndices = new Set(
    Object.entries(item.dimensionBreakoutInfo.dimensionMapping)
      .filter(([, dimensionId]) => dimensionId != null)
      .map(([slotIndex]) => Number(slotIndex)),
  );
  const itemsByDimensionId = getDimensionPickerItemByDimensionId(sections);
  const comparableSectionItems = sections
    .flatMap((section) => section.items)
    .filter(
      (sectionItem) =>
        sectionItem !== item &&
        getComparableDimensionKey(sectionItem) === comparableKey,
    );

  const comparableItems = [
    item,
    ...comparableSectionItems.filter(
      (sectionItem) => sectionItem.name === item.name,
    ),
    ...comparableSectionItems.filter(
      (sectionItem) => sectionItem.name !== item.name,
    ),
  ];

  for (const [slotIndex, dimensionId] of Object.entries(
    activeDimensionBreakout.dimensionMapping,
  )) {
    const numericSlotIndex = Number(slotIndex);
    if (
      !slotIndices.has(numericSlotIndex) ||
      clickedSlotIndices.has(numericSlotIndex)
    ) {
      continue;
    }

    const currentItem = dimensionId
      ? itemsByDimensionId.get(dimensionId)
      : undefined;
    if (
      currentItem &&
      getComparableDimensionKey(currentItem) === comparableKey
    ) {
      mapping[numericSlotIndex] = dimensionId;
    }
  }

  for (const comparableItem of comparableItems) {
    for (const [slotIndex, dimensionId] of Object.entries(
      comparableItem.dimensionBreakoutInfo.dimensionMapping,
    )) {
      const numericSlotIndex = Number(slotIndex);
      if (slotIndices.has(numericSlotIndex)) {
        mapping[numericSlotIndex] ??= dimensionId;
      }
    }
  }

  return mapping;
}

export function buildDimensionPickerSidebarCategories({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  metricSlots = [],
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  metricSlots?: MetricSlot[];
}): DimensionPickerSidebarCategory[] {
  const sections = buildDimensionPickerSections({
    availableDimensions,
    sourceOrder,
    sourceDataById,
  });
  const items = sections
    .flatMap((section) => section.items)
    .filter(shouldShowInDefaultSidebar);
  const categories: DimensionPickerSidebarCategory[] = [];
  const groupedItems = new Map<string, DimensionPickerItem[]>();

  for (const item of items) {
    const key = getComparableDimensionKey(item);
    const existing = groupedItems.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groupedItems.set(key, [item]);
    }
  }

  for (const [key, categoryItems] of groupedItems) {
    const first = categoryItems[0];
    const category = buildSidebarCategory(
      key,
      getSidebarCategoryName(first),
      categoryItems,
    );

    if (
      metricSlots.length === 0 ||
      hasMappingForEverySlot(category, metricSlots)
    ) {
      categories.push(category);
    }
  }

  return categories.sort(sortSidebarCategories);
}

export function buildDimensionPickerSidebarCategorySelectRows({
  category,
  activeDimensionBreakout,
  metricSlots,
  sourceDataById,
  sourceColors,
}: {
  category: DimensionPickerSidebarCategory;
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState;
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
      const dimensionId =
        item.dimensionBreakoutInfo.dimensionMapping[slot.slotIndex];
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
            ? `${groupName ?? fallbackGroupName} → ${option.label}`
            : option.label,
      }))
      .sort((first, second) => first.label.localeCompare(second.label));
    if (options.length === 0) {
      return [];
    }

    const activeDimensionId =
      activeDimensionBreakout.dimensionMapping[slot.slotIndex] ?? null;

    return [
      {
        slotIndex: slot.slotIndex,
        sourceId: slot.sourceId,
        metricName: sourceDataById[slot.sourceId]?.name ?? slot.sourceId,
        colors: sourceColors[slot.entityIndex],
        isExpressionToken: slot.tokenPosition != null,
        value: options.some((option) => option.value === activeDimensionId)
          ? activeDimensionId
          : null,
        options,
      },
    ];
  });
}
