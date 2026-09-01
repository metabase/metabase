import type {
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
  useListStaleFindingsQuery,
  useListSlowFindingsQuery,
  useListDuplicatedFindingsQuery,
  useListImbalancedFindingsQuery,
} = contentDiagnosticsApi;
