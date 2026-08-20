import { Api } from "metabase/api";
import { provideOAuthAuthorizationListTags } from "metabase/api/tags";
import type {
  ListOAuthAuthorizationsRequest,
  ListOAuthAuthorizationsResponse,
} from "metabase-types/api";

export const oauthApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listOAuthAuthorizations: builder.query<
      ListOAuthAuthorizationsResponse,
      ListOAuthAuthorizationsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/oauth/authorizations",
        params,
      }),
      providesTags: (response) =>
        response ? provideOAuthAuthorizationListTags(response.data) : [],
    }),
  }),
});

export const { useListOAuthAuthorizationsQuery } = oauthApi;
