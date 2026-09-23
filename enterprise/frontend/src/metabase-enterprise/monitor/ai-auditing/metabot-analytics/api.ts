import { EnterpriseApi } from "metabase-enterprise/api/api";
import { idTag, invalidateTags, tag } from "metabase-enterprise/api/tags";

import type {
  ConversationDetail,
  ConversationReview,
  ConversationsRequest,
  ConversationsResponse,
  DataComplexityScoresResponse,
} from "./types";

export const metabotAnalyticsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMetabotAnalyticsConversations: builder.query<
      ConversationsResponse,
      ConversationsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/metabot-analytics/conversations",
        params,
      }),
    }),
    getMetabotAnalyticsConversation: builder.query<ConversationDetail, string>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/metabot-analytics/conversations/${id}`,
      }),
      providesTags: (_, __, id) => [idTag("metabot-conversation", id)],
    }),
    scoreMetabotConversation: builder.mutation<ConversationReview, string>({
      query: (id) => ({
        method: "POST",
        url: `/api/jev/conversations/${id}/score`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [idTag("metabot-conversation", id)]),
    }),
    getDataComplexityScores: builder.query<DataComplexityScoresResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/data-complexity-score/complexity",
      }),
      providesTags: () => [tag("data-complexity-scores")],
    }),
    refreshDataComplexityScores: builder.mutation<
      DataComplexityScoresResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/data-complexity-score/complexity",
        params: { "force-recalculation": true },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("data-complexity-scores")]),
    }),
  }),
});

export const {
  useListMetabotAnalyticsConversationsQuery,
  useLazyListMetabotAnalyticsConversationsQuery,
  useGetMetabotAnalyticsConversationQuery,
  useScoreMetabotConversationMutation,
  useGetDataComplexityScoresQuery,
  useRefreshDataComplexityScoresMutation,
} = metabotAnalyticsApi;
