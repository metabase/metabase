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

/** Type-keyed aggregate categories reselect their fixed breakout across related fields. */
function isTypeKeyedAggregateCategory(
  key: string,
  config: DimensionBreakoutTypeDefinition,
): config is Extract<
  DimensionBreakoutTypeDefinition,
  { matchMode: "aggregate" }
> {
  return config.matchMode === "aggregate" && key.startsWith("type:");
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

function mergeDimensionMappings(items: DimensionPickerItem[]) {
  const mapping: Record<number, string> = {};

  const preferredItems = [...items].sort(sortPreferredItemsFirst);

  for (const item of preferredItems) {
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

function sortPreferredItemsFirst(
  first: DimensionPickerItem,
  second: DimensionPickerItem,
) {
  return (
    Number(second.isPreferred === true) - Number(first.isPreferred === true)
  );
}
