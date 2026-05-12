import { useCallback, useMemo, useState } from "react";

import { useSelector } from "metabase/redux";

import type { OptimizeResponse } from "../api";
import { optimizerApi, useOptimizeQuery } from "../api";
import type { OptimizerRunState } from "../types";

const INITIAL: OptimizerRunState = {
  status: "idle",
  summary: null,
  proposals: [],
  optimizationDegree: null,
  error: null,
};

type Options = {
  transformId: number | string;
};

type Controls = {
  state: OptimizerRunState;
  start: (opts?: { analyze?: boolean }) => void;
  abort: () => void;
  reset: () => void;
  dismissProposal: (proposalId: string) => void;
};

/**
 * Drives the optimizer panel. Wraps a regular auto-subscribing
 * `useOptimizeQuery` rather than the lazy variant so that the result
 * survives `TransformOptimizerSection` unmounts — e.g. switching tabs and
 * returning. We pair that with a long `keepUnusedDataFor` on the endpoint
 * so the cache outlives the brief gap between unmount and remount.
 *
 * On mount we inspect the RTK Query cache for an existing result; if one
 * is there we flip into "requested" mode immediately so the component
 * renders the cached payload instead of the trigger button. A fresh
 * request is only sent when `start()` is called explicitly or when the
 * user passes `analyze: true` (a different cache key).
 *
 * Local-only state we still track in the component:
 *   - `dismissed` — ids the user has dismissed locally. Not persisted
 *     across unmounts on purpose; dismissing is a "for this view" action.
 */
export function useOptimizerStream({ transformId }: Options): Controls {
  const [analyze, setAnalyze] = useState(false);
  const args = useMemo(
    () => ({ transformId, analyze }),
    [transformId, analyze],
  );

  // Look up whatever's in the cache for `args`. If there's already a
  // payload (e.g. the user ran the optimizer earlier and is coming back
  // from another tab), treat the hook as already-requested so the
  // auto-query re-attaches without firing a new fetch.
  // Cast the state to `any` here — `EnterpriseApi`'s tag-union typing is
  // wider than the root `Api`'s, so its `.select(...)` selector won't
  // structurally match `metabase/redux`'s `State`. We only need the
  // `{data, error}` shape, which is independent of the tag set.
  const cachedResult = useSelector((state) =>
    optimizerApi.endpoints.optimize.select(args)(
      state as Parameters<ReturnType<typeof optimizerApi.endpoints.optimize.select>>[0],
    ),
  );
  const [hasRequested, setHasRequested] = useState<boolean>(
    () => !!cachedResult?.data || !!cachedResult?.error,
  );

  const queryResult = useOptimizeQuery(args, {
    skip: !hasRequested,
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const start = useCallback(
    ({ analyze: nextAnalyze = false }: { analyze?: boolean } = {}) => {
      // Re-running clears any per-instance dismissals — they apply to the
      // last result the user saw, not the next one.
      setDismissed(new Set());
      if (nextAnalyze !== analyze) {
        setAnalyze(nextAnalyze);
      }
      setHasRequested(true);
      // If the cache already has a fresh result for these args, the query
      // hook will deliver it without refetching. If we want a fresh run
      // even when cached, the caller can `reset()` first.
      void queryResult.refetch?.();
    },
    [analyze, queryResult],
  );

  const abort = useCallback(() => {
    // RTK Query auto-queries don't expose a per-subscription abort the way
    // lazy queries do. The cheapest "stop showing the loader" is to mark
    // the hook unrequested again; an inflight network call will still
    // finish but its result will sit in cache until the user explicitly
    // re-requests.
    setHasRequested(false);
  }, []);

  const reset = useCallback(() => {
    setHasRequested(false);
    setDismissed(new Set());
  }, []);

  const dismissProposal = useCallback((proposalId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(proposalId);
      return next;
    });
  }, []);

  const state = projectState(
    {
      data: queryResult.data,
      error: queryResult.error as { message?: string } | undefined,
      isFetching: queryResult.isFetching,
      isUninitialized: queryResult.isUninitialized,
      isError: queryResult.isError,
      isSuccess: queryResult.isSuccess,
    },
    dismissed,
    hasRequested,
  );

  return { state, start, abort, reset, dismissProposal };
}

type LazyResult = {
  data?: OptimizeResponse;
  error?: { message?: string };
  isFetching: boolean;
  isUninitialized: boolean;
  isSuccess: boolean;
  isError: boolean;
};

function projectState(
  result: LazyResult,
  dismissed: Set<string>,
  hasRequested: boolean,
): OptimizerRunState {
  if (!hasRequested && !result.data) {
    return INITIAL;
  }
  if (result.isFetching) {
    return { ...INITIAL, status: "loading" };
  }
  if (result.isError) {
    return {
      ...INITIAL,
      status: "error",
      error: {
        message:
          (result.error && result.error.message) ||
          "Optimizer request failed.",
        retryable: true,
      },
    };
  }
  if (!result.data) {
    return INITIAL;
  }
  return {
    status: "done",
    summary: result.data.summary ?? null,
    proposals: result.data.proposals.filter((p) => !dismissed.has(p.id)),
    optimizationDegree: result.data.optimization_degree,
    error: null,
  };
}
