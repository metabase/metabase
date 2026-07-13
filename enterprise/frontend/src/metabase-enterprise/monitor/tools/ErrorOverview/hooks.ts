import { useCallback, useEffect, useRef } from "react";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import { isAbortError } from "metabase/api/client";
import type { DatasetQuery } from "metabase-types/api";

/**
 * Runs an adhoc dataset query and aborts the previous in-flight request
 * whenever the query changes.
 */
export function useAbortableAdhocQuery(query: DatasetQuery) {
  const [trigger, result] = useLazyGetAdhocQueryQuery();
  const requestRef = useRef<ReturnType<typeof trigger> | null>(null);

  const run = useCallback(() => {
    requestRef.current?.abort();
    const request = trigger(query);
    requestRef.current = request;
    return request;
  }, [trigger, query]);

  useEffect(() => {
    run();
    return () => requestRef.current?.abort();
  }, [run]);

  return {
    ...result,
    // Aborted cancellation error is dropped to avoid flashing the error view.
    error: isAbortError(result.error) ? undefined : result.error,
    isLoading: result.isLoading || result.isUninitialized,
    refetch: run,
  };
}
