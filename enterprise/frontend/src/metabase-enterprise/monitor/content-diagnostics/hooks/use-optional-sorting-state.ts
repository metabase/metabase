import type { SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  type Sorting,
  getNextOptionalSorting,
  getSortingState,
} from "metabase/utils/sorting";

type UseOptionalSortingStateProps<TColumn extends string> = {
  sortOptions: Sorting<TColumn> | undefined;
  columns: readonly TColumn[];
  onSortOptionsChange: (sortOptions: Sorting<TColumn> | undefined) => void;
};

/**
 * Adapter between TanStack Table sorting state and content diagnostics sorting.
 * Unlike `useSortingStateChange`, cycling to the unsorted state is allowed: the
 * API's default order (`detected-at`) has no visible column to show as sorted.
 */
export function useOptionalSortingState<TColumn extends string>({
  sortOptions,
  columns,
  onSortOptionsChange,
}: UseOptionalSortingStateProps<TColumn>) {
  const sortingState = useMemo(
    () => getSortingState(sortOptions),
    [sortOptions],
  );

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      onSortOptionsChange(getNextOptionalSorting(newSortingState, columns));
    },
    [sortingState, columns, onSortOptionsChange],
  );

  return { sortingState, onSortingChange };
}
