import { t } from "ttag";

import type {
  DimensionBreakoutInfo,
  MetricsViewerDimensionBreakoutState,
} from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
  DimensionPickerSidebarCategory,
} from "metabase/metrics-viewer/utils";

import type { MetricSlot } from "../../utils/metric-slots";

function getDimensionMappingEntries(
  dimensionBreakoutInfo:
    | DimensionBreakoutInfo
    | MetricsViewerDimensionBreakoutState,
) {
  return Object.entries(dimensionBreakoutInfo.dimensionMapping).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );
}

export function hasSameDimensions(
  item: DimensionPickerItem,
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  if (item.dimensionBreakoutInfo.type !== dimensionBreakout.type) {
    return false;
  }

  const itemEntries = getDimensionMappingEntries(item.dimensionBreakoutInfo);
  const dimensionBreakoutEntries =
    getDimensionMappingEntries(dimensionBreakout);
  return (
    itemEntries.length === dimensionBreakoutEntries.length &&
    itemEntries.every(
      ([slotIndex, dimensionId]) =>
        dimensionBreakout.dimensionMapping[Number(slotIndex)] === dimensionId,
    )
  );
}

export function hasMatchingDimensions(
  item: DimensionPickerItem,
  dimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  if (item.dimensionBreakoutInfo.type !== dimensionBreakout.type) {
    return false;
  }

  const itemEntries = getDimensionMappingEntries(item.dimensionBreakoutInfo);
  return (
    itemEntries.length > 0 &&
    itemEntries.every(
      ([slotIndex, dimensionId]) =>
        dimensionBreakout.dimensionMapping[Number(slotIndex)] === dimensionId,
    )
  );
}

export function filterSections(
  sections: DimensionPickerSection[],
  searchText: string,
): DimensionPickerSection[] {
  const trimmedSearchText = searchText.trim().toLocaleLowerCase();
  if (!trimmedSearchText) {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.name.toLocaleLowerCase().includes(trimmedSearchText),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function getSidebarSectionName(sectionName?: string) {
  if (sectionName === t`Shared`) {
    return t`Shared dimensions`;
  }

  return sectionName;
}

export function getSelectedCategoryKey(
  categories: DimensionPickerSidebarCategory[],
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  return categories.find((category) =>
    isCategorySelected(category, activeDimensionBreakout),
  )?.key;
}

export function isCategorySelected(
  category: DimensionPickerSidebarCategory,
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  if (
    category.dimensionBreakoutInfo.type === "time" &&
    activeDimensionBreakout.type === "time"
  ) {
    return true;
  }

  return (
    hasSameDimensions(category, activeDimensionBreakout) ||
    category.targetItems.some((item) =>
      hasSameDimensions(item, activeDimensionBreakout),
    )
  );
}

export function hasMultipleMetricSources(metricSlots: MetricSlot[]) {
  return new Set(metricSlots.map((slot) => slot.sourceId)).size > 1;
}

export function getDimensionBreakoutId(item: DimensionPickerItem) {
  return Object.values(item.dimensionBreakoutInfo.dimensionMapping).find(
    (dimensionId) => dimensionId != null,
  );
}

export function isMatchingActiveDimensionBreakout(
  item: DimensionPickerItem,
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState,
) {
  const dimensionBreakoutId = getDimensionBreakoutId(item);

  return (
    hasMatchingDimensions(item, activeDimensionBreakout) &&
    item.dimensionBreakoutInfo.label === activeDimensionBreakout.label &&
    (dimensionBreakoutId == null ||
      dimensionBreakoutId === activeDimensionBreakout.id)
  );
}
