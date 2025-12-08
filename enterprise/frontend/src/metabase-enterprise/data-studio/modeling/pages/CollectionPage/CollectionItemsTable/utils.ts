import type { CollectionItem } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { SortColumn } from "./types";

export const DEFAULT_SORTING_OPTIONS: SortingOptions<SortColumn> = {
  sort_column: "name",
  sort_direction: SortDirection.Asc,
};

export function getItemDescription(item: CollectionItem): string {
  return item.description ?? "";
}

export function sortItems(
  items: CollectionItem[],
  sortingOptions: SortingOptions<SortColumn>,
): CollectionItem[] {
  const { sort_column, sort_direction } = sortingOptions;

  return [...items].sort((a, b) => {
    const aValue = a[sort_column] ?? "";
    const bValue = b[sort_column] ?? "";
    const result = String(aValue).localeCompare(String(bValue));
    return sort_direction === SortDirection.Asc ? result : -result;
  });
}
