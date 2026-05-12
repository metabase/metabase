import type {
  ListSourceReplacementRunsRequest,
  ReplaceModelWithTransformRequest,
  ReplaceModelWithTransformResponse,
  ReplaceSourceRequest,
  ReplaceSourceResponse,
  SourceReplacementCheckInfo,
  SourceReplacementRun,
  SourceReplacementRunId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSourceReplacementRunListTags,
  provideSourceReplacementRunTags,
} from "./tags";

export const replacementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkReplaceSource: builder.query<
      SourceReplacementCheckInfo,
      ReplaceSourceRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/check-replace-source",
        body,
      }),
      providesTags: (_response, _error, request) => [
        idTag(request.source_entity_type, request.source_entity_id),
        idTag(request.target_entity_type, request.target_entity_id),
      ],
    }),
    replaceSource: builder.mutation<
      ReplaceSourceResponse,
      ReplaceSourceRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/replace-source",
        body,
      }),
      invalidatesTags: (_response, error) =>
        invalidateTags(error, [listTag("source-replacement-run")]),
    }),
    listSourceReplacementRuns: builder.query<
      SourceReplacementRun[],
      ListSourceReplacementRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/replacement/runs",
        params,
      }),
      providesTags: (runs) =>
        runs ? provideSourceReplacementRunListTags(runs) : [],
    }),
    getSourceReplacementRun: builder.query<
      SourceReplacementRun,
      SourceReplacementRunId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/replacement/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideSourceReplacementRunTags(run) : []),
    }),
    replaceModelWithTransform: builder.mutation<
      ReplaceModelWithTransformResponse,
      ReplaceModelWithTransformRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/replace-model-with-transform",
        body,
      }),
      invalidatesTags: (_response, error) =>
        invalidateTags(error, [listTag("source-replacement-run")]),
    }),
  }),
});

export const {
  useCheckReplaceSourceQuery,
  useReplaceSourceMutation,
  useListSourceReplacementRunsQuery,
  useGetSourceReplacementRunQuery,
  useReplaceModelWithTransformMutation,
} = replacementApi;
