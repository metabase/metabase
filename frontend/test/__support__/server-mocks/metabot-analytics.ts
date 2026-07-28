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
) {
  const response: ConversationsResponse = {
    data: conversations,
    total: conversations.length,
    limit: conversations.length,
    offset: 0,
  };
  fetchMock.get("path:/api/ee/metabot-analytics/conversations", response);
}
