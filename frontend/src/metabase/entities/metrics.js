import {
  metricApi,
  useGetMetricQuery,
  useListMetricsQuery,
} from "metabase/api";
import { MetricSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";

import { createEntity, entityCompatibleQuery } from "./utils";

/**
 * @deprecated use "metabase/api" instead
 */
export const Metrics = createEntity({
  name: "metrics",
  nameOne: "metric",
  path: "/api/metric",
  schema: MetricSchema,

  rtk: () => ({
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery: useListMetricsQuery,
  }),

  api: {
    list: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        metricApi.endpoints.listMetrics,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        metricApi.endpoints.getMetric,
      ),
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).metric(entityId),
  },

  objectSelectors: {
    getName: (metric) => metric && metric.name,
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetMetricQuery(id, options);
};
