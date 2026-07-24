import type {
  ContentDiagnosticsScanResult,
  ListStaleFindingsRequest,
  ListStaleFindingsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

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
    runContentDiagnosticsScan: builder.mutation<
      ContentDiagnosticsScanResult,
      void
    >({
      query: () => ({
        method: "POST",
        url: "/api/ee/content-diagnostics/scan",
      }),
      invalidatesTags: (_result, error) =>
        invalidateTags(error, [listTag("content-diagnostics-finding")]),
    }),
  }),
});

export const {
  useListStaleFindingsQuery,
  useRunContentDiagnosticsScanMutation,
} = contentDiagnosticsApi;
