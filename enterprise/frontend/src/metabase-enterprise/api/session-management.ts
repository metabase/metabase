import type {
  AdminSessionListParams,
  AdminSessionListResponse,
  RevokeAdminSessionsRequest,
  RevokeAdminSessionsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, provideAdminSessionListTags } from "./tags";

export const sessionManagementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSessions: builder.query<
      AdminSessionListResponse,
      AdminSessionListParams
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/session-management",
        params,
      }),
      providesTags: (response) =>
        response ? provideAdminSessionListTags(response.data) : [],
    }),

    revokeSessions: builder.mutation<
      RevokeAdminSessionsResponse,
      RevokeAdminSessionsRequest
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
} = sessionManagementApi;
