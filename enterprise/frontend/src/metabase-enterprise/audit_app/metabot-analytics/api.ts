import { EnterpriseApi } from "metabase-enterprise/api/api";

import type {
  ConversationDetail,
  ConversationsRequest,
  ConversationsResponse,
  MetabotSummary,
  UsageDataPoint,
} from "./types";

export const metabotAnalyticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMetabotAnalyticsSummary: builder.query<MetabotSummary, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/metabot-analytics/summary",
      }),
    }),
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
    getMetabotUsage: builder.query<UsageDataPoint[], { days?: number }>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/metabot-analytics/usage",
        params,
      }),
    }),
  }),
});

export const {
  useGetMetabotAnalyticsSummaryQuery,
  useListMetabotConversationsQuery,
  useGetMetabotConversationQuery,
  useGetMetabotUsageQuery,
} = metabotAnalyticsApi;
