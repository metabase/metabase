import { useCallback, useEffect, useRef, useState } from "react";

import {
  type OptimizeResponse,
  useLazyOptimizeQuery,
} from "../api";
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
 * Thin wrapper around `useLazyOptimizeQuery`. The endpoint used to be SSE,
 * but the LLM call is fully buffered server-side anyway, so the streaming
 * machinery wasn't pulling its weight. We keep this hook's shape stable so
 * the section component doesn't need to know that the wire shape changed.
 *
 * Local-only state we still track:
 *   - `dismissedProposalIds` so "Dismiss" hides a card without re-fetching.
 *   - The abort token from `useLazyOptimizeQuery` so an unmount mid-call
 *     doesn't try to setState on a dead component.
 */
export function useOptimizerStream({ transformId }: Options): Controls {
  const [trigger, queryResult] = useLazyOptimizeQuery();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const lastSubscriptionRef = useRef<{ abort: () => void } | null>(null);

  const start = useCallback(
    ({ analyze = false }: { analyze?: boolean } = {}) => {
      lastSubscriptionRef.current?.abort();
      setDismissed(new Set());
      const sub = trigger({ transformId, analyze });
      lastSubscriptionRef.current = sub as unknown as { abort: () => void };
    },
    [trigger, transformId],
  );

  const abort = useCallback(() => {
    lastSubscriptionRef.current?.abort();
    lastSubscriptionRef.current = null;
  }, []);

  const reset = useCallback(() => {
    lastSubscriptionRef.current?.abort();
    lastSubscriptionRef.current = null;
    setDismissed(new Set());
  }, []);

  const dismissProposal = useCallback((proposalId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(proposalId);
      return next;
    });
  }, []);

  // Cancel on unmount so a navigation doesn't leak a fetch.
  useEffect(() => {
    return () => {
      lastSubscriptionRef.current?.abort();
    };
  }, []);

  const state = projectState(queryResult, dismissed);
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
): OptimizerRunState {
  if (result.isUninitialized) {
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
