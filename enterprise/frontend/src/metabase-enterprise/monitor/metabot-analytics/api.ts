import { EnterpriseApi } from "metabase-enterprise/api/api";
import { invalidateTags, tag } from "metabase-enterprise/api/tags";

import type {
  ConversationDetail,
  ConversationsRequest,
  ConversationsResponse,
  DataComplexityScoresResponse,
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
  useListMetabotConversationsQuery,
  useGetMetabotConversationQuery,
  useGetDataComplexityScoresQuery,
  useRefreshDataComplexityScoresMutation,
} = metabotAnalyticsApi;
