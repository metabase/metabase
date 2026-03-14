import type {
  ListModelReplacementRunsRequest,
  ListSourceReplacementRunsRequest,
  ModelReplacementRun,
  ModelReplacementRunId,
  ReplaceModelRequest,
  ReplaceModelResponse,
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
  provideModelReplacementRunListTags,
  provideModelReplacementRunTags,
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
        url: "/api/ee/replacement/source/check-replace",
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
        url: "/api/ee/replacement/source/replace",
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
        url: "/api/ee/replacement/source/runs",
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
        url: `/api/ee/replacement/source/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideSourceReplacementRunTags(run) : []),
    }),
    replaceModel: builder.mutation<ReplaceModelResponse, ReplaceModelRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/model/replace",
        body,
      }),
      invalidatesTags: (_response, error) =>
        invalidateTags(error, [listTag("model-replacement-run")]),
    }),
    listModelReplacementRuns: builder.query<
      ModelReplacementRun[],
      ListModelReplacementRunsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/replacement/model/runs",
        params,
      }),
      providesTags: (runs) =>
        runs ? provideModelReplacementRunListTags(runs) : [],
    }),
    getModelReplacementRun: builder.query<
      ModelReplacementRun,
      ModelReplacementRunId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/replacement/model/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideModelReplacementRunTags(run) : []),
    }),
  }),
});

export const {
  useCheckReplaceSourceQuery,
  useReplaceSourceMutation,
  useListSourceReplacementRunsQuery,
  useGetSourceReplacementRunQuery,
  useReplaceModelMutation,
  useListModelReplacementRunsQuery,
  useGetModelReplacementRunQuery,
} = replacementApi;
