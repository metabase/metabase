import { useMemo } from "react";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type { MetricsViewerDimensionBreakoutType } from "metabase/metrics-viewer/types";
import {
  type DimensionBreakoutTypeDefinition,
  type DimensionPickerItem,
  type DimensionPickerSidebarCategory,
  getComparableDimensionKey,
  getDimensionBreakoutConfig,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import { useDimensionPickerSidebarSections } from "./useDimensionPickerSidebarSections";

export function useDimensionPickerSidebarCategories(): DimensionPickerSidebarCategory[] {
  const { metricSlots } = useMetricsViewerContext();
  const sections = useDimensionPickerSidebarSections();

  return useMemo(
    () => getDimensionPickerSidebarCategories(sections, metricSlots),
    [metricSlots, sections],
  );
}

function getDimensionPickerSidebarCategories(
  sections: ReturnType<typeof useDimensionPickerSidebarSections>,
  metricSlots: MetricSlot[],
) {
  const items = sections
    .flatMap((section) => section.items)
    .filter((item) => shouldShowInDefaultSidebar(item, metricSlots));
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

function buildSidebarCategory(
  key: string,
  name: string,
  items: DimensionPickerItem[],
): DimensionPickerSidebarCategory {
  const first = items[0];
  const dimensionBreakoutInfo = {
    ...first.dimensionBreakoutInfo,
    label: name,
    dimensionMapping: mergeDimensionMappings(items),
  };
  const config = getDimensionBreakoutConfig(dimensionBreakoutInfo.type);
  const shouldUseFixedAggregateId = isTypeKeyedAggregateCategory(key, config);

  return {
    ...first,
    key,
    name,
    targetItems: items,
    dimensionBreakoutInfo: shouldUseFixedAggregateId
      ? { ...dimensionBreakoutInfo, id: config.fixedId }
      : dimensionBreakoutInfo,
  };
}

function isTypeKeyedAggregateCategory(
  key: string,
  config: DimensionBreakoutTypeDefinition,
): config is Extract<
  DimensionBreakoutTypeDefinition,
  { matchMode: "aggregate" }
> {
  return config.matchMode === "aggregate" && key === `type:${config.type}`;
}

function shouldShowInDefaultSidebar(
  item: DimensionPickerItem,
  metricSlots: MetricSlot[],
) {
  if (metricSlots.length > 1 && hasMappingForEverySlot(item, metricSlots)) {
    return true;
  }

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

// Rank by breakout type only; the sort is stable, so categories of the same
// type keep the metric's curated dimension order.
function sortSidebarCategories(
  first: DimensionPickerSidebarCategory,
  second: DimensionPickerSidebarCategory,
) {
  return (
    SIDEBAR_CATEGORY_ORDER.indexOf(first.dimensionBreakoutInfo.type) -
    SIDEBAR_CATEGORY_ORDER.indexOf(second.dimensionBreakoutInfo.type)
  );
}

function getSidebarCategoryName(item: DimensionPickerItem) {
  const type = item.dimensionBreakoutInfo.type;

  if (type === "time") {
    return t`Time`;
  }

  if (type === "geo" && item.geoSubtype === "country") {
    return t`Country`;
  }

  if (type === "geo" && item.geoSubtype === "state") {
    return t`State`;
  }

  return item.name;
}

function hasMappingForEverySlot(
  item: DimensionPickerItem,
  metricSlots: MetricSlot[],
) {
  return metricSlots.every(
    (slot) => item.dimensionBreakoutInfo.dimensionMapping[slot.slotIndex],
  );
}

function mergeDimensionMappings(items: DimensionPickerItem[]) {
  const mapping: Record<number, string> = {};

  for (const item of flattenNameGroupsByCoverage(items)) {
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

interface DimensionNameGroup {
  items: DimensionPickerItem[];
  slotIndices: Set<number>;
  hasPreferred: boolean;
}

function flattenNameGroupsByCoverage(items: DimensionPickerItem[]) {
  const groups = new Map<string, DimensionNameGroup>();

  for (const item of items) {
    let group = groups.get(item.name);
    if (!group) {
      group = { items: [], slotIndices: new Set(), hasPreferred: false };
      groups.set(item.name, group);
    }
    group.items.push(item);
    group.hasPreferred ||= item.isPreferred === true;
    for (const [slotIndex, dimensionId] of Object.entries(
      item.dimensionBreakoutInfo.dimensionMapping,
    )) {
      if (dimensionId != null) {
        group.slotIndices.add(Number(slotIndex));
      }
    }
  }

  return [...groups.values()]
    .sort(
      (first, second) =>
        second.slotIndices.size - first.slotIndices.size ||
        Number(second.hasPreferred) - Number(first.hasPreferred),
    )
    .flatMap((group) => group.items);
}
