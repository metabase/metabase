import { useCallback, useRef, useState } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch } from "metabase/lib/redux";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";

import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  applyBreakoutDimension,
  buildExecutableDefinition,
} from "../utils/queries";

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
    async (
      definitions: MetricsViewerDefinitionEntry[],
      tab: MetricsViewerTabState,
    ) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const executableDefs = tab.definitions.filter(
        (c) => c.projectionDimensionId != null,
      );
      setExecuting(new Set(executableDefs.map((c) => c.definitionId)));

      const newResults = new Map<DefinitionId, Dataset>();
      const newErrors = new Map<DefinitionId, string>();

      await Promise.allSettled(
        executableDefs.map(async (tabDef) => {
          if (signal.aborted) {
            return;
          }

          const entry = definitions.find((d) => d.id === tabDef.definitionId);
          if (!entry || !entry.definition) {
            newErrors.set(tabDef.definitionId, "No definition available");
            return;
          }

          try {
            let execDef = buildExecutableDefinition(
              entry.definition,
              tab,
              tabDef.projectionDimensionId,
            );

            if (!execDef) {
              newErrors.set(tabDef.definitionId, "Cannot build definition");
              return;
            }

            if (entry.breakoutDimension) {
              execDef = applyBreakoutDimension(
                execDef,
                entry.breakoutDimension,
              );
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
              newResults.set(tabDef.definitionId, result.data as Dataset);
            } else if (result.error) {
              newErrors.set(tabDef.definitionId, getErrorMessage(result.error));
            }
          } catch (err) {
            if (!signal.aborted && !isAbortError(err)) {
              newErrors.set(tabDef.definitionId, getErrorMessage(err));
            }
          }
        }),
      );

      if (!signal.aborted) {
        setResults(newResults);
        setErrors(newErrors);
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
