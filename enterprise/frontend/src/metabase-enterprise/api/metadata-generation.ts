import type {
  ListMetadataGenerationRunsRequest,
  MetadataGenerationEstimate,
  MetadataGenerationRun,
  MetadataGenerationRunId,
  MetadataGenerationRunRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

function provideRunTags(run: MetadataGenerationRun) {
  return [idTag("metadata-generation-run", run.id)];
}

export const metadataGenerationApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMetadataGenerationRuns: builder.query<
      MetadataGenerationRun[],
      ListMetadataGenerationRunsRequest
    >({
      query: ({ database_id }) => ({
        method: "GET",
        url: "/api/ee/data-sensitivity/runs",
        params: { "database-id": database_id },
      }),
      providesTags: (runs = []) => [
        listTag("metadata-generation-run"),
        ...runs.flatMap(provideRunTags),
      ],
    }),
    getMetadataGenerationRun: builder.query<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/data-sensitivity/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideRunTags(run) : []),
    }),
    getMetadataGenerationEstimate: builder.query<
      MetadataGenerationEstimate,
      MetadataGenerationRunRequest
    >({
      query: ({ database_id, schemas, table_ids, attributes }) => ({
        method: "GET",
        url: "/api/ee/data-sensitivity/runs/estimate",
        params: {
          "database-id": database_id,
          schemas,
          "table-ids": table_ids,
          attributes,
        },
      }),
    }),
    startMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/data-sensitivity/runs",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metadata-generation-run")]),
    }),
    cancelMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${id}/cancel`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("metadata-generation-run"),
          idTag("metadata-generation-run", id),
        ]),
    }),
    retryFailedMetadataGenerationRun: builder.mutation<
      MetadataGenerationRun,
      MetadataGenerationRunId
    >({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/data-sensitivity/runs/${id}/retry-failed`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metadata-generation-run")]),
    }),
  }),
});

export const {
  useListMetadataGenerationRunsQuery,
  useGetMetadataGenerationRunQuery,
  useGetMetadataGenerationEstimateQuery,
  useStartMetadataGenerationRunMutation,
  useCancelMetadataGenerationRunMutation,
  useRetryFailedMetadataGenerationRunMutation,
} = metadataGenerationApi;
