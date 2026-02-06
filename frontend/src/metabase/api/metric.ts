import { updateMetadata } from "metabase/lib/redux/metadata";
import { MetricSchema } from "metabase/schema";
import type {
  FieldValue,
  GetMetricDimensionValuesRequest,
  GetMetricDimensionValuesResponse,
  GetRemappedMetricDimensionValueRequest,
  Metric,
  MetricId,
  SearchMetricDimensionValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideMetricDimensionValuesTags,
  provideMetricListTags,
  provideMetricTags,
} from "./tags/utils";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const metricApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listMetrics: builder.query<Metric[], void>({
      query: () => ({
        method: "GET",
        url: "/api/metric",
      }),
      providesTags: (metrics = []) => provideMetricListTags(metrics),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, [MetricSchema])),
        ),
    }),
    getMetric: builder.query<Metric, MetricId>({
      query: (id) => ({
        method: "GET",
        url: `/api/metric/${id}`,
      }),
      providesTags: (metric) => (metric ? provideMetricTags(metric) : []),
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) =>
          dispatch(updateMetadata(data, MetricSchema)),
        ),
    }),
    getMetricDimensionValues: builder.query<
      GetMetricDimensionValuesResponse,
      GetMetricDimensionValuesRequest
    >({
      query: ({ metricId, dimensionId }) => ({
        method: "GET",
        url: `/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}/values`,
      }),
      providesTags: (_, error, { metricId }) =>
        provideMetricDimensionValuesTags(metricId),
    }),
    searchMetricDimensionValues: builder.query<
      FieldValue[],
      SearchMetricDimensionValuesRequest
    >({
      query: ({ metricId, dimensionId, ...params }) => ({
        method: "GET",
        url: `/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}/search`,
        params,
      }),
      providesTags: (_, error, { metricId }) =>
        provideMetricDimensionValuesTags(metricId),
    }),
    getRemappedMetricDimensionValue: builder.query<
      FieldValue,
      GetRemappedMetricDimensionValueRequest
    >({
      query: ({ metricId, dimensionId, value }) => ({
        method: "GET",
        url: `/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}/remapping`,
        params: { value },
      }),
      providesTags: (_, error, { metricId }) =>
        provideMetricDimensionValuesTags(metricId),
    }),
  }),
});

export const {
  useListMetricsQuery,
  useGetMetricQuery,
  useLazyGetMetricQuery,
  useGetMetricDimensionValuesQuery,
  useSearchMetricDimensionValuesQuery,
  useGetRemappedMetricDimensionValueQuery,
} = metricApi;
