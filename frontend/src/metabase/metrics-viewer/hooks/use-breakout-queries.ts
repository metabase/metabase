import { useEffect, useMemo } from "react";

import { metricApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { buildBreakoutQueryKeys } from "../utils/query-keys";

type BreakoutValuesMap = Map<MetricSourceId, MetricBreakoutValuesResponse>;

export function useBreakoutQueries(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutValuesMap {
  const dispatch = useDispatch();

  const queryKeys = useMemo(
    () => buildBreakoutQueryKeys(definitions),
    [definitions],
  );

  useEffect(() => {
    if (queryKeys.length === 0) {
      return;
    }

    const subscriptions = queryKeys.map((qk) =>
      dispatch(
        metricApi.endpoints.getMetricBreakoutValues.initiate(qk.request),
      ),
    );

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [queryKeys, dispatch]);

  const queryResults = useSelector((state: State) =>
    queryKeys.map((qk) => ({
      sourceId: qk.sourceId,
      result: metricApi.endpoints.getMetricBreakoutValues.select(qk.request)(
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
