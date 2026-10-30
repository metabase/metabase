import type {
  ContentDiagnosticsCountsResponse,
  InvalidateFindingsRequest,
  InvalidateFindingsResponse,
  ListDuplicatedFindingsRequest,
  ListDuplicatedFindingsResponse,
  ListImbalancedFindingsRequest,
  ListImbalancedFindingsResponse,
  ListSlowFindingsRequest,
  ListSlowFindingsResponse,
  ListStaleFindingsRequest,
  ListStaleFindingsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

export const contentDiagnosticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getContentDiagnosticsCounts: builder.query<
      ContentDiagnosticsCountsResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/counts",
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    invalidateFindings: builder.mutation<
      InvalidateFindingsResponse,
      InvalidateFindingsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/content-diagnostics/invalidate",
        body,
      }),
      invalidatesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listStaleFindings: builder.query<
      ListStaleFindingsResponse,
      ListStaleFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/stale",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listSlowFindings: builder.query<
      ListSlowFindingsResponse,
      ListSlowFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/slow",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listDuplicatedFindings: builder.query<
      ListDuplicatedFindingsResponse,
      ListDuplicatedFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/duplicated",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
    listImbalancedFindings: builder.query<
      ListImbalancedFindingsResponse,
      ListImbalancedFindingsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/content-diagnostics/imbalanced",
        params,
      }),
      providesTags: () => [listTag("content-diagnostics-finding")],
    }),
  }),
});

export const {
  useGetContentDiagnosticsCountsQuery,
  useInvalidateFindingsMutation,
  useListStaleFindingsQuery,
  useListSlowFindingsQuery,
  useListDuplicatedFindingsQuery,
  useListImbalancedFindingsQuery,
} = contentDiagnosticsApi;
