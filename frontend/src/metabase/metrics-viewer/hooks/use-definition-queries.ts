import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import type { Dataset, MetricBreakoutValuesResponse } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";
import {
  getBreakoutDefinition,
  getModifiedDefinition,
  toJsDefinition,
} from "../utils/definition-cache";
import { entryHasBreakout } from "../utils/series";

export interface UseDefinitionQueriesResult {
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>;
  isExecuting: (id: MetricSourceId) => boolean;
}

export function useDefinitionQueries(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState | null,
): UseDefinitionQueriesResult {
  const dispatch = useDispatch();

  const datasetRequests = useMemo(() => {
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

  const breakoutRequests = useMemo(() => {
    return definitions.flatMap((entry) => {
      if (!entry.definition || !entryHasBreakout(entry)) {
        return [];
      }

      const jsDefinition = getBreakoutDefinition(entry.definition);

      return [
        {
          sourceId: entry.id,
          request: { definition: jsDefinition },
        },
      ];
    });
  }, [definitions]);

  const modifiedDefinitions = useMemo(() => {
    const map = new Map<MetricSourceId, MetricDefinition>();
    for (const { sourceId, modifiedDefinition } of datasetRequests) {
      map.set(sourceId, modifiedDefinition);
    }
    return map;
  }, [datasetRequests]);

  useEffect(() => {
    if (datasetRequests.length === 0) {
      return;
    }

    const subscriptions = datasetRequests.map((query) =>
      dispatch(metricApi.endpoints.getMetricDataset.initiate(query.request)),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [datasetRequests, dispatch]);

  useEffect(() => {
    if (breakoutRequests.length === 0) {
      return;
    }

    const subscriptions = breakoutRequests.map((query) =>
      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate(query.request),
      ),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [breakoutRequests, dispatch]);

  const datasetResults = useSelector((state: State) =>
    datasetRequests.map((query) => ({
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricDataset.select(query.request)(state),
    })),
  );

  const breakoutResults = useSelector((state: State) =>
    breakoutRequests.map((query) => ({
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricBreakoutValues.select(query.request)(
        state,
      ),
    })),
  );

  const { resultsByDefinitionId, errorsByDefinitionId, isExecuting } =
    useMemo(() => {
      const results = new Map<MetricSourceId, Dataset>();
      const errors = new Map<MetricSourceId, string>();
      const executing = new Set<MetricSourceId>();

      for (const { sourceId, result } of datasetResults) {
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
    }, [datasetResults]);

  const breakoutValuesBySourceId = useMemo(() => {
    const map = new Map<MetricSourceId, MetricBreakoutValuesResponse>();
    for (const { sourceId, result } of breakoutResults) {
      if (result.data) {
        map.set(sourceId, result.data);
      }
    }
    return map;
  }, [breakoutResults]);

  return {
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    breakoutValuesBySourceId,
    isExecuting,
  };
}
