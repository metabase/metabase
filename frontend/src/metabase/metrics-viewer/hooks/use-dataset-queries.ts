import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";

export interface UseDatasetQueriesResult {
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  isExecuting: (id: MetricSourceId) => boolean;
}

export function useDatasetQueries(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState | null,
): UseDatasetQueriesResult {
  const dispatch = useDispatch();

  const queryRequests = useMemo(() => {
    if (!tab) {
      return [];
    }

    return definitions.flatMap((entry) => {
      const dimensionId = tab.dimensionMapping[entry.id];
      if (!dimensionId || !entry.definition) {
        return [];
      }

      const modifiedDefinition = getModifiedDefinition(
        entry.definition,
        dimensionId,
        tab.projectionConfig,
      );

      if (!modifiedDefinition) {
        return [];
      }

      const jsDefinition = toJsDefinition(modifiedDefinition);

      return [
        {
          sourceId: entry.id,
          modifiedDefinition,
          request: { definition: jsDefinition },
        },
      ];
    });
  }, [definitions, tab]);

  const modifiedDefinitions = useMemo(() => {
    const map = new Map<MetricSourceId, MetricDefinition>();
    for (const { sourceId, modifiedDefinition } of queryRequests) {
      map.set(sourceId, modifiedDefinition);
    }
    return map;
  }, [queryRequests]);

  useEffect(() => {
    if (queryRequests.length === 0) {
      return;
    }

    const subscriptions = queryRequests.map((query) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(query.request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [queryRequests, dispatch]);

  const queryResults = useSelector((state: State) =>
    queryRequests.map((query) => ({
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricDataset.select(query.request)(state),
    })),
  );

  const { resultsByDefinitionId, errorsByDefinitionId, isExecuting } =
    useMemo(() => {
      const results = new Map<MetricSourceId, Dataset>();
      const errors = new Map<MetricSourceId, string>();
      const executing = new Set<MetricSourceId>();

      for (const { sourceId, result } of queryResults) {
        if (result.data) {
          results.set(sourceId, result.data);
        }
        if (result.error) {
          errors.set(sourceId, getErrorMessage(result.error));
        }
        if (result.isLoading || ("isFetching" in result && result.isFetching)) {
          executing.add(sourceId);
        }
      }

      return {
        resultsByDefinitionId: results,
        errorsByDefinitionId: errors,
        isExecuting: (id: MetricSourceId) => executing.has(id),
      };
    }, [queryResults]);

  return {
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    isExecuting,
  };
}
