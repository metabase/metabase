import { Api } from "metabase/api/api";
import type { ForkMetabotConversationRequest } from "metabase-types/api";

import type { MetabotConversationDetail } from "./utils/normalize-fetched-chat-messages";

/**
 * Metabot's conversation endpoints live here rather than in metabase/api:
 * their response type is this module's own chat-message shape, which the api
 * module (a layer below) must not import.
 */
export const metabotConversationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getMetabotConversation: builder.query<MetabotConversationDetail, string>({
      query: (conversationId) => ({
        method: "GET",
        url: `/api/metabot/conversations/${conversationId}`,
      }),
    }),
    forkMetabotConversation: builder.mutation<
      MetabotConversationDetail,
      ForkMetabotConversationRequest
    >({
      query: ({ conversation_id, ...body }) => ({
        method: "POST",
        url: `/api/metabot/conversations/${conversation_id}/fork`,
        body,
      }),
    }),
  }),
});

export const {
  useGetMetabotConversationQuery,
  useForkMetabotConversationMutation,
} = metabotConversationApi;
