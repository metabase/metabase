import { t } from "ttag";

import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types";
import type {
  DimensionBreakoutInfo,
  DimensionPickerItem,
  DimensionPickerSection,
  DimensionPickerSidebarCategory,
} from "metabase/metrics-viewer/utils";

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
  const tabEntries = getDimensionMappingEntries(dimensionBreakout);
  return (
    itemEntries.length === tabEntries.length &&
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
  return (
    hasSameDimensions(category, activeDimensionBreakout) ||
    category.targetItems.some((item) =>
      hasSameDimensions(item, activeDimensionBreakout),
    )
  );
}
