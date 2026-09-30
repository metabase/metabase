import type { SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import {
  getNextOptionalSorting,
  getSortingState,
  toSorting,
  toSortingOptions,
} from "metabase/utils/sorting";
import type { SortingOptions } from "metabase-types/api";

type RequiredSortingProps<TColumn extends string> = {
  sortingOptions: SortingOptions<TColumn>;
  columns: readonly TColumn[];
  defaultSorting: SortingOptions<TColumn>;
  onSortingOptionsChange: (sortingOptions: SortingOptions<TColumn>) => void;
};

type OptionalSortingProps<TColumn extends string> = {
  sortingOptions?: SortingOptions<TColumn>;
  columns: readonly TColumn[];
  defaultSorting?: never;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<TColumn> | undefined,
  ) => void;
};

/**
 * Adapter between TanStack Table sorting state and API sorting. Tables with a
 * visible default stay sorted; tables relying on an API-only default may omit
 * `defaultSorting` and cycle to an unsorted state.
 */
export function useSortingStateChange<TColumn extends string>(
  props: RequiredSortingProps<TColumn>,
): {
  sortingState: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
};
export function useSortingStateChange<TColumn extends string>(
  props: OptionalSortingProps<TColumn>,
): {
  sortingState: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
};
export function useSortingStateChange<TColumn extends string>(
  props: RequiredSortingProps<TColumn> | OptionalSortingProps<TColumn>,
) {
  const { sortingOptions, columns } = props;
  const sortingState = useMemo(
    () =>
      getSortingState(
        sortingOptions == null ? undefined : toSorting(sortingOptions),
      ),
    [sortingOptions],
  );

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSortingState =
        typeof updater === "function" ? updater(sortingState) : updater;
      const nextSorting = getNextOptionalSorting(newSortingState, columns);
      if (props.defaultSorting != null) {
        props.onSortingOptionsChange(
          toSortingOptions(nextSorting ?? toSorting(props.defaultSorting)),
        );
      } else {
        props.onSortingOptionsChange(
          nextSorting == null ? undefined : toSortingOptions(nextSorting),
        );
      }
    },
    [sortingState, columns, props],
  );

  return { sortingState, onSortingChange };
}
