import fetchMock from "fetch-mock";

import type {
  ConversationDetail,
  ConversationSummary,
  ConversationsResponse,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";

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
  responseOverrides: Partial<ConversationsResponse> = {},
) {
  const response: ConversationsResponse = {
    data: conversations,
    total: conversations.length,
    limit: conversations.length,
    offset: 0,
    ...responseOverrides,
  };
  fetchMock.get("path:/api/ee/metabot-analytics/conversations", response);
}
