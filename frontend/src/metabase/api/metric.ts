import type {
  CreateMetricRequest,
  DeleteMetricRequest,
  Metric,
  MetricId,
  UpdateMetricRequest,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

function metricTags(metric: Metric) {
  return [
    idTag("metric", metric.id),
    ...(metric.table ? [idTag("table", metric.table.id)] : []),
  ];
}

export const metricApi = Api.injectEndpoints({
  endpoints: builder => ({
    listMetrics: builder.query<Metric[], void>({
      query: () => ({
        method: "GET",
        url: "/api/legacy-metric",
      }),
      providesTags: (metrics = []) => [
        listTag("metric"),
        ...metrics.flatMap(metricTags),
      ],
    }),
    getMetric: builder.query<Metric, MetricId>({
      query: id => ({
        method: "GET",
        url: `/api/legacy-metric/${id}`,
      }),
      providesTags: metric => (metric ? metricTags(metric) : []),
    }),
    createMetric: builder.mutation<Metric, CreateMetricRequest>({
      query: body => ({
        method: "POST",
        url: "/api/legacy-metric",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metric"), tag("table")]),
    }),
    updateMetric: builder.mutation<Metric, UpdateMetricRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/legacy-metric/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("metric"),
          idTag("metric", id),
          tag("table"),
        ]),
    }),
    deleteMetric: builder.mutation<Metric, DeleteMetricRequest>({
      query: ({ id, ...body }) => ({
        method: "DELETE",
        url: `/api/legacy-metric/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("metric"),
          idTag("metric", id),
          tag("table"),
        ]),
    }),
  }),
});

export const {
  useListMetricsQuery,
  useGetMetricQuery,
  useCreateMetricMutation,
  useUpdateMetricMutation,
  useDeleteMetricMutation,
} = metricApi;
