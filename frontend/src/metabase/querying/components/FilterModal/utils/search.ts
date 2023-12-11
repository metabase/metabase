import { t } from "ttag";
import type * as Lib from "metabase-lib";
import { SEARCH_KEY } from "../constants";
import type { GroupItem } from "../types";

export function isSearchActive(searchText: string) {
  return searchText.length > 0;
}

export function getColumnName(
  columnInfo: Lib.ColumnDisplayInfo,
  isSearching: boolean,
) {
  return isSearching ? columnInfo.longDisplayName : columnInfo.displayName;
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

  return [
    {
      key: SEARCH_KEY,
      displayName: t`Search`,
      icon: "search",
      columnItems,
    },
  ];
}
