import { useCallback, useEffect, useRef, useState } from "react";

import { runOptimizerStream } from "../api";
import type {
  OptimizerStreamError,
  OptimizerStreamEvent,
  OptimizerStreamState,
  Proposal,
} from "../types";

const INITIAL: OptimizerStreamState = {
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
  state: OptimizerStreamState;
  start: (opts?: { analyze?: boolean }) => void;
  abort: () => void;
  reset: () => void;
  dismissProposal: (proposalId: string) => void;
};

export function useOptimizerStream({ transformId }: Options): Controls {
  const [state, setState] = useState<OptimizerStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((event: OptimizerStreamEvent) => {
    setState((prev) => reduceEvent(prev, event));
  }, []);

  const start = useCallback(
    ({ analyze = false }: { analyze?: boolean } = {}) => {
      // Cancel any in-flight stream before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: "streaming",
        summary: null,
        proposals: [],
        optimizationDegree: null,
        error: null,
      });

      void runOptimizerStream({
        transformId,
        analyze,
        signal: controller.signal,
        onEvent: handleEvent,
      })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError") {
            return;
          }
          setState((prev) => ({
            ...prev,
            status: "error",
            error: {
              message: (err as Error)?.message ?? "Stream failed",
              retryable: true,
            },
          }));
        })
        .finally(() => {
          // If neither a `done` nor an `error` ever landed, mark as done so
          // the UI doesn't sit on a perpetual spinner.
          setState((prev) =>
            prev.status === "streaming" ? { ...prev, status: "done" } : prev,
          );
        });
    },
    [transformId, handleEvent],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) =>
      prev.status === "streaming" ? { ...prev, status: "aborted" } : prev,
    );
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const dismissProposal = useCallback((proposalId: string) => {
    setState((prev) => ({
      ...prev,
      proposals: prev.proposals.filter((p) => p.id !== proposalId),
    }));
  }, []);

  // Cancel on unmount so a navigation doesn't leak a fetch.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { state, start, abort, reset, dismissProposal };
}

function reduceEvent(
  prev: OptimizerStreamState,
  event: OptimizerStreamEvent,
): OptimizerStreamState {
  switch (event.event) {
    case "summary":
      return { ...prev, summary: event.data.text };
    case "proposal": {
      const incoming: Proposal = event.data;
      // Server may stream the same proposal twice (retry); dedupe by id.
      const existing = prev.proposals.findIndex((p) => p.id === incoming.id);
      const nextProposals =
        existing >= 0
          ? prev.proposals.map((p, i) => (i === existing ? incoming : p))
          : [...prev.proposals, incoming];
      return { ...prev, proposals: nextProposals };
    }
    case "done":
      return {
        ...prev,
        status: "done",
        optimizationDegree: event.data.optimization_degree,
      };
    case "error":
      return reduceError(prev, event.data);
  }
}

function reduceError(
  prev: OptimizerStreamState,
  error: OptimizerStreamError,
): OptimizerStreamState {
  return { ...prev, status: "error", error };
}
