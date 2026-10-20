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
      // every client, since criteria can revoke ones not named, and the Authorization logs, which record the revoke
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
