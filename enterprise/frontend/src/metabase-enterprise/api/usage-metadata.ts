import type {
  CreateUsageMetadataCandidateRequest,
  CreateUsageMetadataCandidateResponse,
  ListUsageMetadataRequest,
  StartUsageMetadataRefreshResponse,
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateSummary,
  UsageMetadataPage,
  UsageMetadataRefreshStatus,
  UsageMetadataTableSummary,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

const BASE_URL = "/api/ee/data-studio/usage-metadata";

export const usageMetadataApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listUsageMetadataTables: builder.query<
      UsageMetadataPage<UsageMetadataTableSummary>,
      ListUsageMetadataRequest
    >({
      query: (params) => ({
        method: "GET",
        url: `${BASE_URL}/tables`,
        params,
      }),
      providesTags: [listTag("usage-metadata-candidate")],
    }),
    listUsageMetadataCandidates: builder.query<
      UsageMetadataPage<UsageMetadataCandidateSummary>,
      ListUsageMetadataRequest
    >({
      query: (params) => ({
        method: "GET",
        url: `${BASE_URL}/candidates`,
        params,
      }),
      providesTags: (response) => [
        listTag("usage-metadata-candidate"),
        ...(response?.data.map((candidate) =>
          idTag("usage-metadata-candidate", candidate.id),
        ) ?? []),
      ],
    }),
    getUsageMetadataCandidate: builder.query<
      UsageMetadataCandidateDetail,
      number
    >({
      query: (id) => ({
        method: "GET",
        url: `${BASE_URL}/candidates/${id}`,
      }),
      providesTags: (_response, _error, id) => [
        idTag("usage-metadata-candidate", id),
      ],
    }),
    dismissUsageMetadataCandidate: builder.mutation<void, number>({
      query: (id) => ({
        method: "POST",
        url: `${BASE_URL}/candidates/${id}/dismiss`,
      }),
      invalidatesTags: (response, error, id) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
        ]),
    }),
    restoreUsageMetadataCandidate: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `${BASE_URL}/candidates/${id}/dismissal`,
      }),
      invalidatesTags: (response, error, id) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
        ]),
    }),
    createUsageMetadataCandidate: builder.mutation<
      CreateUsageMetadataCandidateResponse,
      CreateUsageMetadataCandidateRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `${BASE_URL}/candidates/${id}/create`,
        body,
      }),
      invalidatesTags: (response, error, { id }) =>
        invalidateTags(error, [
          idTag("usage-metadata-candidate", id),
          listTag("usage-metadata-candidate"),
        ]),
    }),
    getUsageMetadataRefreshStatus: builder.query<
      UsageMetadataRefreshStatus,
      void
    >({
      query: () => ({
        method: "GET",
        url: `${BASE_URL}/refresh`,
      }),
      providesTags: [tag("usage-metadata-refresh")],
    }),
    startUsageMetadataRefresh: builder.mutation<
      StartUsageMetadataRefreshResponse,
      void
    >({
      query: () => ({
        method: "POST",
        url: `${BASE_URL}/refresh`,
      }),
      invalidatesTags: (_response, error) =>
        invalidateTags(error, [tag("usage-metadata-refresh")]),
    }),
  }),
});

export const {
  useListUsageMetadataTablesQuery,
  useListUsageMetadataCandidatesQuery,
  useGetUsageMetadataCandidateQuery,
  useDismissUsageMetadataCandidateMutation,
  useRestoreUsageMetadataCandidateMutation,
  useCreateUsageMetadataCandidateMutation,
  useGetUsageMetadataRefreshStatusQuery,
  useStartUsageMetadataRefreshMutation,
} = usageMetadataApi;
