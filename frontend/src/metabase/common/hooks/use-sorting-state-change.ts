import type { SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  getNextOptionalSorting,
  getSortingState,
  toSorting,
  toSortingOptions,
} from "metabase/utils/sorting";
import type { SortingOptions } from "metabase-types/api";

type UseSortingStateChangeProps<TColumn extends string> = {
  sortingOptions: SortingOptions<TColumn>;
  columns: readonly TColumn[];
  defaultSorting: SortingOptions<TColumn>;
  onSortingOptionsChange: (sortingOptions: SortingOptions<TColumn>) => void;
};

/**
 * Adapter between TanStack Table sorting state and API's `SortingOptions` for
 * manually-sorted tables.
 * Falls back to `defaultSorting` when TanStack cycles to the unsorted state.
 */
export function useSortingStateChange<TColumn extends string>({
  sortingOptions,
  columns,
  defaultSorting,
  onSortingOptionsChange,
}: UseSortingStateChangeProps<TColumn>) {
  const sortingState = useMemo(
    () => getSortingState(toSorting(sortingOptions)),
    [sortingOptions],
  );

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;

      const nextOptionalSorting =
        getNextOptionalSorting(newSortingState, columns) ??
        toSorting(defaultSorting);

      onSortingOptionsChange(toSortingOptions(nextOptionalSorting));
    },
    [sortingState, columns, defaultSorting, onSortingOptionsChange],
  );

  return { sortingState, onSortingChange };
}
