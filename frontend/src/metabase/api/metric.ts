import type {
  FieldValue,
  GetMetricDimensionValuesRequest,
  GetMetricDimensionValuesResponse,
  GetRemappedMetricDimensionValueRequest,
  SearchMetricDimensionValuesRequest,
} from "metabase-types/api";

import { Api } from "./api";

export const metricApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getMetricDimensionValues: builder.query<
      GetMetricDimensionValuesResponse,
      GetMetricDimensionValuesRequest
    >({
      query: ({ metricId, dimensionId }) => ({
        method: "GET",
        url: `/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}/values`,
      }),
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
    }),
  }),
});

export const {
  useGetMetricDimensionValuesQuery,
  useSearchMetricDimensionValuesQuery,
  useGetRemappedMetricDimensionValueQuery,
} = metricApi;
