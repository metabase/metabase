import type {
  CheckReplaceSourceInfo,
  ReplaceSourceRequest,
  ReplaceSourceResponse,
  ReplaceSourceRun,
  ReplaceSourceRunId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  provideReplaceSourceRunTags,
  tag,
} from "./tags";

export const replacementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkReplaceSource: builder.query<
      CheckReplaceSourceInfo,
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
        invalidateTags(error, [tag("table"), tag("card")]),
    }),
    getReplaceSourceRun: builder.query<ReplaceSourceRun, ReplaceSourceRunId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/replacement/runs/${id}`,
      }),
      providesTags: (run) => (run ? provideReplaceSourceRunTags(run) : []),
    }),
  }),
});

export const {
  useCheckReplaceSourceQuery,
  useReplaceSourceMutation,
  useGetReplaceSourceRunQuery,
} = replacementApi;
