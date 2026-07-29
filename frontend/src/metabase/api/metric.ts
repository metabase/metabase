import { MetricSchema } from "metabase/schema";
import type {
  AddMetricDimensionsRequest,
  Dataset,
  FieldValue,
  GetMetricDimensionValuesRequest,
  GetMetricDimensionValuesResponse,
  GetRemappedMetricDimensionValueRequest,
  ListMetricDimensionsRequest,
  ListMetricDimensionsResponse,
  Metric,
  MetricBreakoutValuesRequest,
  MetricBreakoutValuesResponse,
  MetricDatasetRequest,
  MetricDimension,
  MetricId,
  RemoveMetricDimensionsRequest,
  ReorderMetricDimensionsRequest,
  SearchMetricDimensionValuesRequest,
  SetDefaultMetricDimensionRequest,
  UpdateMetricDimensionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  provideMetricDimensionListTags,
  provideMetricDimensionValuesTags,
  provideMetricListTags,
  provideMetricTags,
} from "./tags/utils";
import { getMetricDatasetCacheKey } from "./utils/get-metric-dataset-cache-key";
import { hydrateMetadataStore } from "./utils/hydrate-metadata-store";

/**
 * Curation edits change the dimensions embedded in the metric card itself,
 * so consumers of `getMetric` and projected metric datasets must refetch too.
 */
function metricDimensionInvalidationTags(metricId: MetricId) {
  return [
    "metric-dimension" as const,
    idTag("metric-dimension", metricId),
    idTag("card", metricId),
  ];
}

export const metricApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listMetrics: builder.query<Metric[], void>({
      query: () => ({
        method: "GET",
        url: "/api/metric",
      }),
      providesTags: (metrics = []) => provideMetricListTags(metrics),
      onQueryStarted: hydrateMetadataStore([MetricSchema]),
    }),
    getMetric: builder.query<Metric, MetricId>({
      query: (id) => ({
        method: "GET",
        url: `/api/metric/${id}`,
      }),
      providesTags: (metric) => (metric ? provideMetricTags(metric) : []),
      onQueryStarted: hydrateMetadataStore(MetricSchema),
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
    listMetricDimensions: builder.query<
      ListMetricDimensionsResponse,
      ListMetricDimensionsRequest
    >({
      query: ({ metricId, ...params }) => ({
        method: "GET",
        url: `/api/metric/${metricId}/dimension`,
        params,
      }),
      providesTags: (_, error, { metricId }) =>
        provideMetricDimensionListTags(metricId),
    }),
    addMetricDimensions: builder.mutation<
      MetricDimension[],
      AddMetricDimensionsRequest
    >({
      query: ({ metricId, ...body }) => ({
        method: "POST",
        url: `/api/metric/${metricId}/dimension/add`,
        body,
      }),
      invalidatesTags: (_, error, { metricId }) =>
        invalidateTags(error, metricDimensionInvalidationTags(metricId)),
    }),
    removeMetricDimensions: builder.mutation<
      MetricDimension[],
      RemoveMetricDimensionsRequest
    >({
      query: ({ metricId, ...body }) => ({
        method: "POST",
        url: `/api/metric/${metricId}/dimension/remove`,
        body,
      }),
      invalidatesTags: (_, error, { metricId }) =>
        invalidateTags(error, metricDimensionInvalidationTags(metricId)),
    }),
    reorderMetricDimensions: builder.mutation<
      MetricDimension[],
      ReorderMetricDimensionsRequest
    >({
      query: ({ metricId, ...body }) => ({
        method: "POST",
        url: `/api/metric/${metricId}/dimension/reorder`,
        body,
      }),
      onQueryStarted: async (
        { metricId, dimension_ids },
        { dispatch, queryFulfilled },
      ) => {
        // Reflect the drop immediately; the invalidation refetch confirms it.
        const patch = dispatch(
          metricApi.util.updateQueryData(
            "listMetricDimensions",
            { metricId, query: undefined, "include-orphaned": true },
            (draft) => {
              const position = new Map(
                dimension_ids.map((id, index) => [id, index]),
              );
              draft.added.sort(
                (a, b) =>
                  (position.get(a.id) ?? Infinity) -
                  (position.get(b.id) ?? Infinity),
              );
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_, error, { metricId }) =>
        invalidateTags(error, metricDimensionInvalidationTags(metricId)),
    }),
    setDefaultMetricDimension: builder.mutation<
      MetricDimension[],
      SetDefaultMetricDimensionRequest
    >({
      query: ({ metricId, ...body }) => ({
        method: "POST",
        url: `/api/metric/${metricId}/dimension/set-default`,
        body,
      }),
      invalidatesTags: (_, error, { metricId }) =>
        invalidateTags(error, metricDimensionInvalidationTags(metricId)),
    }),
    updateMetricDimension: builder.mutation<
      MetricDimension,
      UpdateMetricDimensionRequest
    >({
      query: ({ metricId, dimensionId, ...body }) => ({
        method: "POST",
        url: `/api/metric/${metricId}/dimension/${encodeURIComponent(dimensionId)}`,
        body,
      }),
      invalidatesTags: (_, error, { metricId }) =>
        invalidateTags(error, metricDimensionInvalidationTags(metricId)),
    }),
    getMetricBreakoutValues: builder.query<
      MetricBreakoutValuesResponse,
      MetricBreakoutValuesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/metric/breakout-values",
        body,
      }),
      keepUnusedDataFor: 30 * 60,
    }),
    getMetricDataset: builder.query<Dataset, MetricDatasetRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/metric/dataset",
        body,
      }),
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}(${getMetricDatasetCacheKey(queryArgs)})`,
      providesTags: ["metric-dimension"],
      keepUnusedDataFor: 30 * 60,
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
  useListMetricDimensionsQuery,
  useAddMetricDimensionsMutation,
  useRemoveMetricDimensionsMutation,
  useReorderMetricDimensionsMutation,
  useSetDefaultMetricDimensionMutation,
  useUpdateMetricDimensionMutation,
  useGetMetricBreakoutValuesQuery,
  useGetMetricDatasetQuery,
} = metricApi;
