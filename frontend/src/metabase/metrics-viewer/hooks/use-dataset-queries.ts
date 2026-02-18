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
  buildDatasetQueryKeys,
  getModifiedDefinitions,
} from "../utils/query-keys";

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

  const queryKeys = useMemo(
    () => (tab ? buildDatasetQueryKeys(definitions, tab) : []),
    [definitions, tab],
  );

  const modifiedDefinitions = useMemo(
    () => (tab ? getModifiedDefinitions(definitions, tab) : new Map()),
    [definitions, tab],
  );

  useEffect(() => {
    if (queryKeys.length === 0) {
      return;
    }

    const subscriptions = queryKeys.map((qk) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(qk.request)),
    );

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [queryKeys, dispatch]);

  const queryResults = useSelector((state: State) =>
    queryKeys.map((qk) => ({
      sourceId: qk.sourceId,
      result: metricApi.endpoints.getMetricDataset.select(qk.request)(state),
    })),
  );

  const resultsByDefinitionId = useMemo(() => {
    const map = new Map<MetricSourceId, Dataset>();
    for (const { sourceId, result } of queryResults) {
      if (result.data) {
        map.set(sourceId, result.data);
      }
    }
    return map;
  }, [queryResults]);

  const errorsByDefinitionId = useMemo(() => {
    const map = new Map<MetricSourceId, string>();
    for (const { sourceId, result } of queryResults) {
      if (result.error) {
        map.set(sourceId, getErrorMessage(result.error));
      }
    }
    return map;
  }, [queryResults]);

  const executingIds = useMemo(() => {
    const set = new Set<MetricSourceId>();
    for (const { sourceId, result } of queryResults) {
      if (result.isLoading || ("isFetching" in result && result.isFetching)) {
        set.add(sourceId);
      }
    }
    return set;
  }, [queryResults]);

  const isExecuting = useMemo(
    () => (id: MetricSourceId) => executingIds.has(id),
    [executingIds],
  );

  return {
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    isExecuting,
  };
}
