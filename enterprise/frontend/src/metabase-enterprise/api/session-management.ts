import type {
  RevokeSessionsRequest,
  RevokeSessionsResponse,
  SessionCountsResponse,
  SessionListParams,
  SessionListResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, provideSessionListTags } from "./tags";

export const sessionManagementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSessions: builder.query<SessionListResponse, SessionListParams>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/session-management",
        params,
      }),
      providesTags: (response) =>
        response ? provideSessionListTags(response.data) : [],
    }),

    sessionCounts: builder.query<SessionCountsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/session-management/counts",
      }),
      providesTags: [listTag("session")],
    }),

    revokeSessions: builder.mutation<
      RevokeSessionsResponse,
      RevokeSessionsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/session-management/revoke",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("session")]),
    }),
  }),
});

export const {
  useListSessionsQuery,
  useLazyListSessionsQuery,
  useRevokeSessionsMutation,
  useSessionCountsQuery,
} = sessionManagementApi;
