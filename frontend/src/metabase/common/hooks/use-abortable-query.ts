import { useCallback, useEffect, useRef } from "react";
import _ from "underscore";

import { isAbortError } from "metabase/api/client";

type LazyQueryResult = {
  error?: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isUninitialized: boolean;
};

type LazyQueryRequest = {
  abort: () => void;
  unsubscribe: () => void;
};

type UseAbortableQueryOptions = {
  skip?: boolean;
  // Same as in `useQuery`, but without `number` support, since we work with lazy queries.
  refetchOnMountOrArgChange?: boolean;
};

/**
 * Runs an RTK lazy query and aborts the previous in-flight request whenever the
 * arg changes, on unmount, or when the query becomes skipped.
 *
 * Caching mirrors `useQuery`: cache-first by default.
 *
 * Use only for single subscribers, since aborting cancels shared query, and every query sharing the same arg will be aborted.
 */
export function useAbortableQuery<Arg, TResult extends LazyQueryResult>(
  useLazyQueryHook: () => readonly [
    (arg: Arg, preferCacheValue?: boolean) => LazyQueryRequest,
    TResult,
    ...unknown[],
  ],
  arg: Arg,
  {
    skip = false,
    refetchOnMountOrArgChange = false,
  }: UseAbortableQueryOptions = {},
): TResult & { refetch: () => void } {
  const [trigger, result] = useLazyQueryHook();
  const requestRef = useRef<LazyQueryRequest | null>(null);

  const argRef = useRef(arg);
  if (!_.isEqual(argRef.current, arg)) {
    argRef.current = arg;
  }
  const stableArg = argRef.current;

  const run = useCallback(
    (preferCache: boolean) => {
      requestRef.current?.abort();
      const request = trigger(stableArg, preferCache);
      requestRef.current = request;
      return request;
    },
    [trigger, stableArg],
  );

  const refetch = useCallback(() => run(false), [run]);

  useEffect(() => {
    if (skip) {
      // Unsubscribing to prevent the query from being re-fetched when the component is re-mounted, since the query is skipped.
      requestRef.current?.abort();
      requestRef.current?.unsubscribe();
      requestRef.current = null;
      return;
    }
    run(!refetchOnMountOrArgChange);
    return () => requestRef.current?.abort();
  }, [run, skip, refetchOnMountOrArgChange]);

  return {
    ...result,
    // Aborted cancellation error is dropped to avoid flashing the error view.
    error: isAbortError(result.error) ? undefined : result.error,
    isLoading: !skip && (result.isLoading || result.isUninitialized),
    isFetching: !skip && (result.isFetching || result.isUninitialized),
    refetch,
  };
}
