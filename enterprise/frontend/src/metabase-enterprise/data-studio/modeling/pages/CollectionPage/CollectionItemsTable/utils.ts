import { t } from "ttag";

import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { ModelingItem, SortColumn } from "./types";

export const DEFAULT_SORTING_OPTIONS: SortingOptions<SortColumn> = {
  sort_column: "name",
  sort_direction: SortDirection.Asc,
};

export function getItemDescription(item: ModelingItem): string {
  if (!item.description?.trim()) {
    return item.model === "metric" ? t`A metric` : t`A model`;
  }
  return item.description;
}

export function sortItems(
  items: ModelingItem[],
  sortingOptions: SortingOptions<SortColumn>,
): ModelingItem[] {
  const { sort_column, sort_direction } = sortingOptions;

  return [...items].sort((a, b) => {
    const aValue = a[sort_column] ?? "";
    const bValue = b[sort_column] ?? "";
    const result = String(aValue).localeCompare(String(bValue));
    return sort_direction === SortDirection.Asc ? result : -result;
  });
}
