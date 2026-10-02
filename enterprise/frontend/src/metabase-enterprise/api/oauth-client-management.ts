import type {
  OAuthClientDetail,
  OAuthClientId,
  OAuthClientListParams,
  OAuthClientListResponse,
  RevokeOAuthClientsRequest,
  RevokeOAuthClientsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  invalidateTags,
  provideOAuthClientListTags,
  provideOAuthClientTags,
  tag,
} from "./tags";

export const oauthClientManagementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listOAuthClients: builder.query<
      OAuthClientListResponse,
      OAuthClientListParams
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/oauth-client-management",
        params,
      }),
      providesTags: (response) =>
        response ? provideOAuthClientListTags(response.data) : [],
    }),

    getOAuthClient: builder.query<OAuthClientDetail, OAuthClientId>({
      query: (clientId) => ({
        method: "GET",
        url: `/api/ee/oauth-client-management/${clientId}`,
      }),
      providesTags: (client) => (client ? provideOAuthClientTags(client) : []),
    }),

    revokeOAuthClients: builder.mutation<
      RevokeOAuthClientsResponse,
      RevokeOAuthClientsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/oauth-client-management/revoke",
        body,
      }),
      // The whole type, not the list alone: a revoke by criteria can end a client it does not name, and the sidebar
      // may be open on one of them
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("oauth-client")]),
    }),
  }),
});

export const {
  useListOAuthClientsQuery,
  useLazyListOAuthClientsQuery,
  useGetOAuthClientQuery,
  useRevokeOAuthClientsMutation,
} = oauthClientManagementApi;
