import type { SortingState } from "@tanstack/react-table";

import type { SortDirection, SortingOptions } from "metabase-types/api";

export type Sorting<TColumn extends string> = {
  column: TColumn;
  direction: SortDirection;
};

export function toSorting<TColumn extends string>({
  sort_column,
  sort_direction,
}: SortingOptions<TColumn>): Sorting<TColumn> {
  return { column: sort_column, direction: sort_direction };
}

export function toSortingOptions<TColumn extends string>({
  column,
  direction,
}: Sorting<TColumn>): SortingOptions<TColumn> {
  return { sort_column: column, sort_direction: direction };
}

export function getSortingState<TColumn extends string>(
  sorting: Sorting<TColumn> | undefined,
): SortingState {
  return sorting == null
    ? []
    : [{ id: sorting.column, desc: sorting.direction === "desc" }];
}

export function isSortColumn<TColumn extends string>(
  id: string,
  columns: readonly TColumn[],
): id is TColumn {
  return columns.some((column) => column === id);
}

// Helper to drop 'undefined' from TanStack's sorting cycle (for always-sorted tables).
export function getNextSorting<TColumn extends string>(
  sortingState: SortingState,
  columns: readonly TColumn[],
  current: Sorting<TColumn>,
): Sorting<TColumn> {
  const [firstSort] = sortingState;
  if (firstSort != null && isSortColumn(firstSort.id, columns)) {
    return { column: firstSort.id, direction: firstSort.desc ? "desc" : "asc" };
  }
  return {
    column: current.column,
    direction: current.direction === "desc" ? "asc" : "desc",
  };
}

export function getNextOptionalSorting<TColumn extends string>(
  sortingState: SortingState,
  columns: readonly TColumn[],
): Sorting<TColumn> | undefined {
  const [firstSort] = sortingState;
  if (firstSort != null && isSortColumn(firstSort.id, columns)) {
    return { column: firstSort.id, direction: firstSort.desc ? "desc" : "asc" };
  }
  return undefined;
}
