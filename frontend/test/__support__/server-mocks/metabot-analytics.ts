import fetchMock from "fetch-mock";

import type { ConversationDetail } from "metabase-enterprise/audit_app/metabot-analytics/types";

export function setupMetabotConversationEndpoint(
  conversation: ConversationDetail,
) {
  fetchMock.get(
    `path:/api/ee/metabot-analytics/conversations/${conversation.conversation_id}`,
    conversation,
  );
}
