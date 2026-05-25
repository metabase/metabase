import { t } from "ttag";

import type { MetricsViewerTabState } from "metabase/metrics-viewer/types";
import type {
  DimensionPickerItem,
  DimensionPickerSection,
  DimensionPickerSidebarCategory,
  TabInfo,
} from "metabase/metrics-viewer/utils";

function getDimensionMappingEntries(tabInfo: TabInfo | MetricsViewerTabState) {
  return Object.entries(tabInfo.dimensionMapping).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );
}

export function hasSameDimensions(
  item: DimensionPickerItem,
  tab: MetricsViewerTabState,
) {
  if (item.tabInfo.type !== tab.type) {
    return false;
  }

  const itemEntries = getDimensionMappingEntries(item.tabInfo);
  const tabEntries = getDimensionMappingEntries(tab);
  return (
    itemEntries.length === tabEntries.length &&
    itemEntries.every(
      ([slotIndex, dimensionId]) =>
        tab.dimensionMapping[Number(slotIndex)] === dimensionId,
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
  activeTab: MetricsViewerTabState,
) {
  return categories.find((category) => isCategorySelected(category, activeTab))
    ?.key;
}

export function isCategorySelected(
  category: DimensionPickerSidebarCategory,
  activeTab: MetricsViewerTabState,
) {
  return (
    hasSameDimensions(category, activeTab) ||
    category.targetItems.some((item) => hasSameDimensions(item, activeTab))
  );
}
