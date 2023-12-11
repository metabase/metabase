import { t } from "ttag";
import { SEARCH_KEY } from "../constants";
import type { GroupItem } from "../types";

export function isSearchActive(searchText: string) {
  return searchText.length > 0;
}

export function searchGroupItems(
  groupItems: GroupItem[],
  searchText: string,
): GroupItem[] {
  const searchValue = searchText.toLowerCase();
  const columnItems = groupItems
    .flatMap(groupItem => groupItem.columnItems)
    .filter(columnItem =>
      columnItem.displayName.toLowerCase().includes(searchValue),
    );

  if (columnItems.length > 0) {
    return [
      {
        key: SEARCH_KEY,
        displayName: t`Search`,
        icon: "search",
        columnItems,
      },
    ];
  }

  return [];
}
