import { useCallback, useRef, useState } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import { computeModifiedDefinitions } from "../utils/series";

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.message === "Request aborted")
  );
}

export interface UseQueryExecutorResult {
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  isExecuting: (id: MetricSourceId) => boolean;
  executeForTab: (
    definitions: MetricsViewerDefinitionEntry[],
    tab: MetricsViewerTabState,
  ) => Promise<void>;
}

export function useQueryExecutor(): UseQueryExecutorResult {
  const dispatch = useDispatch();
  const [results, setResults] = useState<Map<MetricSourceId, Dataset>>(
    new Map(),
  );
  const [errors, setErrors] = useState<Map<MetricSourceId, string>>(new Map());
  const [modifiedDefs, setModifiedDefs] = useState<
    Map<MetricSourceId, MetricDefinition>
  >(new Map());
  const [executing, setExecuting] = useState<Set<MetricSourceId>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const isExecuting = useCallback(
    (id: MetricSourceId) => executing.has(id),
    [executing],
  );

  const executeForTab = useCallback(
    async (
      definitions: MetricsViewerDefinitionEntry[],
      tab: MetricsViewerTabState,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const signal = controller.signal;

      const modifiedDefinitions = computeModifiedDefinitions(definitions, tab);

      const executableDefs = tab.definitions.filter(
        (c) => c.projectionDimension != null || c.projectionDimensionId != null,
      );
      setExecuting(new Set(executableDefs.map((c) => c.definitionId)));

      const newResults = new Map<MetricSourceId, Dataset>();
      const newErrors = new Map<MetricSourceId, string>();

      await Promise.allSettled(
        executableDefs.map(async (tabDef) => {
          if (signal.aborted) {
            return;
          }

          const execDef = modifiedDefinitions.get(tabDef.definitionId);
          if (!execDef) {
            newErrors.set(tabDef.definitionId, "Cannot build definition");
            return;
          }

          try {
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

      if (controller === abortRef.current && !signal.aborted) {
        setModifiedDefs(modifiedDefinitions);
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
    modifiedDefinitions: modifiedDefs,
    isExecuting,
    executeForTab,
  };
}
