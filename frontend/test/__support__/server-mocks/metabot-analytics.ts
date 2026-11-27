import fetchMock, { type RouteResponse } from "fetch-mock";

import type {
  ConversationDetail,
  ConversationSummary,
  ConversationsResponse,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";

export function setupMetabotConversationEndpoint(
  conversation: ConversationDetail,
) {
  setupMetabotConversationRoute(conversation.conversation_id, conversation);
}

/**
 * Serve the conversation detail as exactly `responseText`, for JSON that
 * `JSON.stringify` can't produce, such as an integer above 2^53. Pass a
 * promise to hold the response until it resolves.
 */
export function setupMetabotConversationRawEndpoint(
  conversationId: string,
  responseText: string | Promise<string>,
) {
  setupMetabotConversationRoute(
    conversationId,
    Promise.resolve(responseText).then((body) => ({
      body,
      headers: { "Content-Type": "application/json" },
    })),
  );
}

/** Make the conversation detail fail from now on, replacing any earlier mock. */
export function setupMetabotConversationEndpointError(
  conversationId: string,
  status = 500,
) {
  setupMetabotConversationRoute(conversationId, { status });
}

function setupMetabotConversationRoute(
  conversationId: string,
  response: RouteResponse,
) {
  const name = `metabot-analytics-conversation-${conversationId}`;
  fetchMock.removeRoute(name);
  fetchMock.get(
    `path:/api/ee/metabot-analytics/conversations/${conversationId}`,
    response,
    { name },
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
