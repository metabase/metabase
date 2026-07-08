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
 * TanStack `SortingState` → `Sorting`. TanStack cycles a column through
 * asc → desc → unsorted; `columns` guards the header id. The `current` argument
 * decides what an unsorted cycle means: pass it for always-sorted tables (the
 * current column's direction is flipped instead) or omit it to allow an
 * unsorted (`undefined`) result.
 */
export function getSorting<TColumn extends string>(
  sortingState: SortingState,
  columns: readonly TColumn[],
  current: Sorting<TColumn>,
): Sorting<TColumn>;
export function getSorting<TColumn extends string>(
  sortingState: SortingState,
  columns: readonly TColumn[],
  current?: Sorting<TColumn>,
): Sorting<TColumn> | undefined;
export function getSorting<TColumn extends string>(
  sortingState: SortingState,
  columns: readonly TColumn[],
  current?: Sorting<TColumn>,
): Sorting<TColumn> | undefined {
  const [firstSort] = sortingState;
  if (firstSort != null && isSortColumn(firstSort.id, columns)) {
    return { column: firstSort.id, direction: firstSort.desc ? "desc" : "asc" };
  }
  return current == null
    ? undefined
    : {
        column: current.column,
        direction: current.direction === "desc" ? "asc" : "desc",
      };
}
