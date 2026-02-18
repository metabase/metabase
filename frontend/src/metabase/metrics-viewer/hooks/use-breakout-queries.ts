import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { getBreakoutDefinition } from "../utils/definition-cache";
import { entryHasBreakout } from "../utils/series";

type BreakoutValuesMap = Map<MetricSourceId, MetricBreakoutValuesResponse>;

export function useBreakoutQueries(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutValuesMap {
  const dispatch = useDispatch();

  const queryRequests = useMemo(() => {
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

  useEffect(() => {
    if (queryRequests.length === 0) {
      return;
    }

    const subscriptions = queryRequests.map((query) =>
      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate(query.request),
      ),
    );

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [queryRequests, dispatch]);

  const queryResults = useSelector((state: State) =>
    queryRequests.map((query) => ({
      sourceId: query.sourceId,
      result: metricApi.endpoints.getMetricBreakoutValues.select(query.request)(
        state,
      ),
    })),
  );

  const breakoutValuesBySourceId = useMemo(() => {
    const map = new Map<MetricSourceId, MetricBreakoutValuesResponse>();
    for (const { sourceId, result } of queryResults) {
      if (result.data) {
        map.set(sourceId, result.data);
      }
    }
    return map;
  }, [queryResults]);

  return breakoutValuesBySourceId;
}
