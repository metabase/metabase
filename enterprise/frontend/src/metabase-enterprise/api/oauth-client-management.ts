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
  listTag,
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
      // Every client, since a revoke by criteria can end ones it doesn't name, and the
      // Authorization logs, since each revoke is logged there
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("oauth-client"),
          listTag("oauth-authorization"),
        ]),
    }),
  }),
});

export const {
  useListOAuthClientsQuery,
  useLazyListOAuthClientsQuery,
  useGetOAuthClientQuery,
  useRevokeOAuthClientsMutation,
} = oauthClientManagementApi;
