import fetchMock from "fetch-mock";

import type {
  HelpAssistantChatResponse,
  HelpAssistantConversation,
  HelpAssistantConversationId,
} from "metabase-types/api";

const CONVERSATIONS_PATH = "/api/user-key-value/namespace/help_assistant";

export const HELP_ASSISTANT_ROUTES = {
  chat: "help-assistant-chat",
  feedback: "help-assistant-feedback",
  saveConversation: "help-assistant-save-conversation",
  deleteConversation: "help-assistant-delete-conversation",
} as const;

export function setupHelpAssistantChatEndpoint(
  response: HelpAssistantChatResponse | number,
  { delay }: { delay?: number } = {},
) {
  fetchMock.post("path:/api/help-assistant/chat", response, {
    name: HELP_ASSISTANT_ROUTES.chat,
    delay,
  });
}

export function setupHelpAssistantFeedbackEndpoint() {
  fetchMock.post(
    "path:/api/help-assistant/feedback",
    { status: 204 },
    { name: HELP_ASSISTANT_ROUTES.feedback },
  );
}

export function setupHelpAssistantConversationsEndpoints(
  conversations: Record<
    HelpAssistantConversationId,
    HelpAssistantConversation
  > = {},
) {
  // The endpoint has no body when nothing is saved yet.
  fetchMock.get(
    `path:${CONVERSATIONS_PATH}`,
    Object.keys(conversations).length > 0
      ? { status: 200, body: conversations }
      : { status: 204 },
  );
  fetchMock.put(
    `express:${CONVERSATIONS_PATH}/key/:key`,
    { status: 200 },
    { name: HELP_ASSISTANT_ROUTES.saveConversation },
  );
  fetchMock.delete(
    `express:${CONVERSATIONS_PATH}/key/:key`,
    { status: 200 },
    { name: HELP_ASSISTANT_ROUTES.deleteConversation },
  );
}
