import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useEffect, useRef } from "react";
import _ from "underscore";

import { RTK_CACHE_KEY_PARAM } from "metabase/api/api";
import { isAbortError } from "metabase/api/client";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";

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
 * Skipping: pass `skipToken` as the arg, or set `{ skip: true }`. While skipped
 * no request is issued and `refetch` is a no-op. Passing `skipToken` avoids
 * having to fabricate a placeholder arg for the skipped state.
 *
 * Each hook instance gets its own RTK cache entry, so aborting is safe.
 * The trade-off is that instances don't share cached responses and
 * identical concurrent requests aren't deduplicated.
 */
export function useAbortableQuery<
  Arg extends object,
  TResult extends LazyQueryResult,
>(
  useLazyQueryHook: () => readonly [
    (arg: Arg, preferCacheValue?: boolean) => LazyQueryRequest,
    TResult,
    ...unknown[],
  ],
  arg: Arg | typeof skipToken,
  {
    skip: skipOption = false,
    refetchOnMountOrArgChange = false,
  }: UseAbortableQueryOptions = {},
): TResult & { refetch: () => void } {
  const [trigger, result] = useLazyQueryHook();
  const requestRef = useRef<LazyQueryRequest | null>(null);
  const instanceKey = useUniqueId("abortable-query");

  const skip = skipOption || arg === skipToken;

  // Keep the last concrete arg; a `skipToken` arg never overwrites it, so
  // `stableArg` only equals `skipToken` before any real arg has arrived.
  const argRef = useRef(arg);
  if (arg !== skipToken && !_.isEqual(argRef.current, arg)) {
    argRef.current = arg;
  }
  const stableArg = argRef.current;

  const run = useCallback(
    (preferCache: boolean) => {
      if (stableArg === skipToken) {
        return null;
      }
      requestRef.current?.abort();
      const request = trigger(
        { ...stableArg, [RTK_CACHE_KEY_PARAM]: instanceKey },
        preferCache,
      );
      requestRef.current = request;
      return request;
    },
    [trigger, stableArg, instanceKey],
  );

  const refetch = useCallback(() => {
    if (!skip) {
      run(false);
    }
  }, [run, skip]);

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
