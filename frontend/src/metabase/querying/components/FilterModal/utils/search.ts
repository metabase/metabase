import { t } from "ttag";

import type { GroupItem } from "metabase/querying/components/FilterContent";

import { SEARCH_KEY } from "../constants";

export function isSearchActive(searchText: string) {
  return searchText.length > 0;
}

export function searchGroupItems(
  groupItems: GroupItem[],
  searchText: string,
): GroupItem[] {
  const searchValue = searchText.toLowerCase();
  const isSearchingForSegments = t`segments`.includes(searchValue);

  const columnItems = groupItems
    .flatMap(groupItem => groupItem.columnItems)
    .filter(columnItem =>
      columnItem.displayName.toLowerCase().includes(searchValue),
    );
  const segmentItems = groupItems
    .flatMap(groupItem => groupItem.segmentItems)
    .filter(
      segmentItem =>
        isSearchingForSegments ||
        segmentItem.displayName.toLowerCase().includes(searchValue),
    );

  if (columnItems.length > 0 || segmentItems.length > 0) {
    return [
      {
        key: SEARCH_KEY,
        displayName: t`Search`,
        icon: "search",
        columnItems,
        segmentItems,
      },
    ];
  }

  return [];
}
