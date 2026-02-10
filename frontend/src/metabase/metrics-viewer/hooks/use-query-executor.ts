import { useCallback, useRef, useState } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch } from "metabase/lib/redux";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";

import { buildExecutableDefinition } from "../utils/queries";
import type {
  MetricsViewerDefinitionEntry,
  DefinitionId,
  MetricsViewerTabState,
} from "../types/viewer-state";

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "Request aborted")
  );
}

export interface UseQueryExecutorResult {
  resultsByDefinitionId: Map<DefinitionId, Dataset>;
  errorsByDefinitionId: Map<DefinitionId, string>;
  isExecuting: (id: DefinitionId) => boolean;
  executeForTab: (
    definitions: MetricsViewerDefinitionEntry[],
    tab: MetricsViewerTabState,
  ) => Promise<void>;
}

export function useQueryExecutor(): UseQueryExecutorResult {
  const dispatch = useDispatch();
  const [results, setResults] = useState<Map<DefinitionId, Dataset>>(new Map());
  const [errors, setErrors] = useState<Map<DefinitionId, string>>(new Map());
  const [executing, setExecuting] = useState<Set<DefinitionId>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const isExecuting = useCallback(
    (id: DefinitionId) => executing.has(id),
    [executing],
  );

  const executeForTab = useCallback(
    async (definitions: MetricsViewerDefinitionEntry[], tab: MetricsViewerTabState) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const executableDefs = tab.definitions.filter(
        (c) => c.projectionDimensionId != null,
      );
      const defIds = executableDefs.map((c) => c.definitionId);
      setExecuting(new Set(defIds));

      await Promise.allSettled(
        executableDefs.map(async (tabDef) => {
          if (signal.aborted) {
            return;
          }

          const entry = definitions.find((d) => d.id === tabDef.definitionId);
          if (!entry || !entry.definition) {
            setErrors((prev) => {
              const m = new Map(prev);
              m.set(tabDef.definitionId, "No definition available");
              return m;
            });
            return;
          }

          try {
            const execDef = buildExecutableDefinition(
              entry.definition,
              tab,
              tabDef.projectionDimensionId,
            );

            if (!execDef) {
              setErrors((prev) => {
                const m = new Map(prev);
                m.set(tabDef.definitionId, "Cannot build definition");
                return m;
              });
              return;
            }

            const jsDefinition = LibMetric.toJsMetricDefinition(execDef);
            const result = await dispatch(
              metricApi.endpoints.getMetricDataset.initiate({
                definition: jsDefinition,
              }),
            );

            if (signal.aborted) {
              return;
            }

            if (result.data) {
              setResults((prev) => {
                const m = new Map(prev);
                m.set(tabDef.definitionId, result.data as Dataset);
                return m;
              });
              setErrors((prev) => {
                const m = new Map(prev);
                m.delete(tabDef.definitionId);
                return m;
              });
            } else if (result.error) {
              setErrors((prev) => {
                const m = new Map(prev);
                m.set(tabDef.definitionId, getErrorMessage(result.error));
                return m;
              });
            }
          } catch (err) {
            if (!signal.aborted && !isAbortError(err)) {
              setErrors((prev) => {
                const m = new Map(prev);
                m.set(tabDef.definitionId, getErrorMessage(err));
                return m;
              });
            }
          }
        }),
      );

      if (!signal.aborted) {
        setExecuting(new Set());
      }
    },
    [dispatch],
  );

  return {
    resultsByDefinitionId: results,
    errorsByDefinitionId: errors,
    isExecuting,
    executeForTab,
  };
}
