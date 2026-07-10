import type { SortingState } from "@tanstack/react-table";

import type { SortDirection } from "metabase-types/api";

/**
 * Canonical single-column sort descriptor shared by tables that drive a
 * TanStack `SortingState` from a server-side sort.
 */
export type Sorting<TColumn extends string> = {
  column: TColumn;
  direction: SortDirection;
};

/** `Sorting` → TanStack `SortingState`. `undefined` yields an unsorted state. */
export function getSortingState<TColumn extends string>(
  sorting: Sorting<TColumn> | undefined,
): SortingState {
  return sorting == null
    ? []
    : [{ id: sorting.column, desc: sorting.direction === "desc" }];
}

/** Whether `id` is one of the known sortable columns. */
export function isSortColumn<TColumn extends string>(
  id: string,
  columns: readonly TColumn[],
): id is TColumn {
  return columns.some((column) => column === id);
}

/**
 * TanStack `SortingState` → `Sorting`, for always-sorted tables. TanStack
 * cycles a column through asc → desc → unsorted; `columns` guards the header
 * id, and an unsorted cycle flips `current`'s direction instead, since these
 * tables always have some column sorted.
 */
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

/**
 * TanStack `SortingState` → `Sorting`, for tables that can be unsorted. Same
 * column cycling as {@link getNextSorting}, but an unsorted cycle yields
 * `undefined` instead of flipping a current column.
 */
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
