import { useCallback, useEffect, useRef } from "react";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import { isAbortError } from "metabase/api/client";
import type { DatasetQuery } from "metabase-types/api";

/**
 * Runs an adhoc dataset query and aborts the previous in-flight request
 * whenever the query changes (e.g. paging/sorting/filtering). The audit
 * `bad-table` scans are slow, so without this a new page's request would be
 * issued while the previous one is still pending on the backend.
 *
 * RTK's `data` is retained across arg changes, so the table keeps showing the
 * previous results while the next request runs (no skeleton flash).
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
    // While a request is being replaced, the hook can momentarily surface the
    // aborted request's error; a cancellation isn't a real error, so drop it
    // to avoid flashing the error view.
    error: isAbortError(result.error) ? undefined : result.error,
    isLoading: result.isLoading || result.isUninitialized,
    refetch: run,
  };
}
