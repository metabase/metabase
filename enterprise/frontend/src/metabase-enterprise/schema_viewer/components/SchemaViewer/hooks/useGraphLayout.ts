import { useCallback, useEffect, useRef, useState } from "react";

import {
  type LayoutRequest,
  type LayoutResult,
  type PreparedLayout,
  completeLayoutSynchronously,
  prepareLayout,
} from "../utils/layout";
import {
  type DagreWorker,
  createDagreWorker,
} from "../utils/layout/dagre-worker-client";
import type { DagreWorkerResponse } from "../utils/layout/types";

export type LayoutReason = "graph-sync" | "auto-layout" | "focus-node";

export type LayoutOutcome =
  | { status: "success"; result: LayoutResult }
  | { status: "cancelled" }
  | { status: "error"; error: unknown };

export type GraphLayoutMethods = {
  requestLayout: (
    request: LayoutRequest,
    reason: LayoutReason,
  ) => Promise<LayoutOutcome>;
  cancelLayout: () => void;
  pendingReason: LayoutReason | null;
  layoutError: unknown;
  clearLayoutError: () => void;
};

type ActiveRequest = {
  generation: number;
  worker: DagreWorker;
  resolve: (outcome: LayoutOutcome) => void;
};

export function useGraphLayout(): GraphLayoutMethods {
  const generationRef = useRef(0);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const workerUnavailableRef = useRef(false);
  const mountedRef = useRef(true);
  const [pendingReason, setPendingReason] = useState<LayoutReason | null>(null);
  const [layoutError, setLayoutError] = useState<unknown>(null);

  const settleActiveRequest = useCallback(
    (
      generation: number,
      outcome: LayoutOutcome,
      options: { updateState: boolean } = { updateState: true },
    ) => {
      const active = activeRequestRef.current;
      if (active == null || active.generation !== generation) {
        return;
      }

      activeRequestRef.current = null;
      active.worker.onmessage = null;
      active.worker.onerror = null;
      active.worker.terminate();
      if (options.updateState && mountedRef.current) {
        setPendingReason(null);
        if (outcome.status === "error") {
          setLayoutError(outcome.error);
        }
      }
      active.resolve(outcome);
    },
    [],
  );

  const cancelActiveRequest = useCallback(
    (updateState: boolean) => {
      const active = activeRequestRef.current;
      if (active == null) {
        if (updateState && mountedRef.current) {
          setPendingReason(null);
        }
        return;
      }
      settleActiveRequest(
        active.generation,
        { status: "cancelled" },
        {
          updateState,
        },
      );
    },
    [settleActiveRequest],
  );

  const finishSynchronously = useCallback(
    (prepared: PreparedLayout): LayoutOutcome => {
      try {
        return {
          status: "success",
          result: completeLayoutSynchronously(prepared),
        };
      } catch (error) {
        return { status: "error", error };
      }
    },
    [],
  );

  const requestLayout = useCallback(
    (request: LayoutRequest, reason: LayoutReason): Promise<LayoutOutcome> => {
      cancelActiveRequest(false);
      const generation = ++generationRef.current;
      if (mountedRef.current) {
        setPendingReason(reason);
        setLayoutError(null);
      }

      let prepared: PreparedLayout;
      try {
        prepared = prepareLayout(request);
      } catch (error) {
        const outcome = { status: "error", error } as const;
        if (mountedRef.current) {
          setPendingReason(null);
          setLayoutError(error);
        }
        return Promise.resolve(outcome);
      }

      if (prepared.kind === "complete" || workerUnavailableRef.current) {
        const outcome = finishSynchronously(prepared);
        if (mountedRef.current) {
          setPendingReason(null);
          if (outcome.status === "error") {
            setLayoutError(outcome.error);
          }
        }
        return Promise.resolve(outcome);
      }

      return new Promise<LayoutOutcome>((resolve) => {
        let worker: DagreWorker;
        try {
          worker = createDagreWorker();
        } catch {
          workerUnavailableRef.current = true;
          const outcome = finishSynchronously(prepared);
          if (mountedRef.current) {
            setPendingReason(null);
            if (outcome.status === "error") {
              setLayoutError(outcome.error);
            }
          }
          resolve(outcome);
          return;
        }

        activeRequestRef.current = { generation, worker, resolve };

        const runFallback = () => {
          workerUnavailableRef.current = true;
          settleActiveRequest(generation, finishSynchronously(prepared));
        };

        worker.onmessage = (event: MessageEvent<DagreWorkerResponse>) => {
          const response = event.data;
          if (response.generation !== generation) {
            return;
          }
          if (response.type === "error") {
            runFallback();
            return;
          }
          try {
            settleActiveRequest(generation, {
              status: "success",
              result: prepared.complete(response.positions),
            });
          } catch (error) {
            settleActiveRequest(generation, { status: "error", error });
          }
        };
        worker.onerror = () => runFallback();

        try {
          worker.postMessage({ generation, graph: prepared.graph });
        } catch {
          runFallback();
        }
      });
    },
    [cancelActiveRequest, finishSynchronously, settleActiveRequest],
  );

  const cancelLayout = useCallback(() => {
    ++generationRef.current;
    cancelActiveRequest(true);
  }, [cancelActiveRequest]);

  const clearLayoutError = useCallback(() => setLayoutError(null), []);
  const cleanupLayout = useCallback(() => {
    mountedRef.current = false;
    ++generationRef.current;
    cancelActiveRequest(false);
  }, [cancelActiveRequest]);

  useEffect(() => {
    mountedRef.current = true;
    return cleanupLayout;
  }, [cleanupLayout]);

  return {
    requestLayout,
    cancelLayout,
    pendingReason,
    layoutError,
    clearLayoutError,
  };
}
