import { useRef } from "react";

import type { Query } from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import { useAdhocBreakoutQuery } from "./useAdhocBreakoutQuery";

type Result = {
  /** No count has resolved yet, or the view's metadata is still loading: show a loader, never the empty state. */
  isInitialLoading: boolean;
  /** A later load triggered by a filter change: let the charts show their own skeletons. */
  isRefetching: boolean;
  hasData: boolean;
  count: number;
  /** The count for the current query only: `undefined` while its metadata or its count is loading. */
  currentCount: number | undefined;
  /** Set when the count query itself failed (e.g. a 500), so the page can show an error instead of spinning forever. */
  error: unknown;
};

// A count aggregation with no breakout returns exactly one row with one column: the total.
function getCount(dataset: Dataset | undefined): number {
  return Number(dataset?.data?.rows?.[0]?.[0] ?? 0);
}

/**
 * Runs a single count query over the filtered view to drive the page's load/empty/data states.
 * Distinguishes the initial load (loader) from a filter-change refetch (skeletons) so the page
 * never flashes the empty state before the first result has resolved.
 */
export function useHasData(countQuery: Query | null): Result {
  const { data, currentData, isFetching, error } =
    useAdhocBreakoutQuery(countQuery);

  // Latch once the first count resolves (successfully or not); from then on a fetch is a
  // refetch, not initial load.
  const hasLoadedOnce = useRef(false);
  const hasError = error != null;
  const resolved =
    countQuery !== null && !isFetching && (data !== undefined || hasError);
  if (resolved) {
    hasLoadedOnce.current = true;
  }

  const count = getCount(data);

  return {
    isInitialLoading: !hasLoadedOnce.current || countQuery === null,
    isRefetching: hasLoadedOnce.current && isFetching,
    hasData: count > 0,
    count,
    currentCount: currentData ? getCount(currentData) : undefined,
    error,
  };
}
