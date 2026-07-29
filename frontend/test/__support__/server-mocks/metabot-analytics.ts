import fetchMock from "fetch-mock";

import type {
  ConversationDetail,
  ConversationSummary,
  ConversationsResponse,
} from "metabase-enterprise/audit_app/metabot-analytics/types";

export function setupMetabotConversationEndpoint(
  conversation: ConversationDetail,
) {
  fetchMock.get(
    `path:/api/ee/metabot-analytics/conversations/${conversation.conversation_id}`,
    conversation,
  );
}

export function setupListMetabotAnalyticsConversationsEndpoint(
  conversations: ConversationSummary[],
  total = conversations.length,
) {
  fetchMock.get("path:/api/ee/metabot-analytics/conversations", (call) => {
    const params = new URL(call.url, "http://localhost").searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? conversations.length);
    const response: ConversationsResponse = {
      data: conversations.slice(offset, offset + limit),
      total,
      limit,
      offset,
    };
    return response;
  });
}
