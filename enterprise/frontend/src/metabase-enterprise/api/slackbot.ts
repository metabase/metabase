import { EnterpriseApi } from "./api";
import type { SlackScopesResponse } from "./types";

export const slackbotApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSlackScopes: builder.query<SlackScopesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-v3/slack/scopes",
      }),
    }),
  }),
});

export const { useGetSlackScopesQuery } = slackbotApi;
