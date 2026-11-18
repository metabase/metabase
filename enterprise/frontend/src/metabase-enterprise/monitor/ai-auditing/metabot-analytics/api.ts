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
    }),
    // The detail's response text, unparsed: JSON.parse would round integers
    // above 2^53, and an export must keep them exact.
    getMetabotAnalyticsConversationText: builder.query<string, string>({
      queryFn: async (id, _api, _extraOptions, baseQuery) => {
        const { data, error } = await baseQuery({
          method: "GET",
          url: `/api/ee/metabot-analytics/conversations/${id}`,
          rawResponse: true,
        });
        if (error) {
          return { error };
        }
        if (!(data instanceof Response)) {
          return { error: new Error("Expected the raw conversation response") };
        }
        return { data: await data.text() };
      },
      keepUnusedDataFor: 0,
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
  useLazyGetMetabotAnalyticsConversationTextQuery,
  useGetDataComplexityScoresQuery,
  useRefreshDataComplexityScoresMutation,
} = metabotAnalyticsApi;
