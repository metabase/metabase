import type {
  OAuthClientListParams,
  OAuthClientListResponse,
  RevokeOAuthClientsRequest,
  RevokeOAuthClientsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag, provideOAuthClientListTags } from "./tags";

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

    revokeOAuthClients: builder.mutation<
      RevokeOAuthClientsResponse,
      RevokeOAuthClientsRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/oauth-client-management/revoke",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("oauth-client")]),
    }),
  }),
});

export const {
  useListOAuthClientsQuery,
  useLazyListOAuthClientsQuery,
  useRevokeOAuthClientsMutation,
} = oauthClientManagementApi;
