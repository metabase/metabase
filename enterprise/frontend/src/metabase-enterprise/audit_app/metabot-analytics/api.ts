import { EnterpriseApi } from "metabase-enterprise/api/api";

import type {
  ConversationDetail,
  ConversationsRequest,
  ConversationsResponse,
} from "./types";

export const metabotAnalyticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMetabotConversations: builder.query<
      ConversationsResponse,
      ConversationsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/metabot-analytics/conversations",
        params,
      }),
    }),
    getMetabotConversation: builder.query<ConversationDetail, string>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/metabot-analytics/conversations/${id}`,
      }),
    }),
  }),
});

export const {
  useListMetabotConversationsQuery,
  useGetMetabotConversationQuery,
} = metabotAnalyticsApi;
