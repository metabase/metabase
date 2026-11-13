import { Api } from "metabase/api";
import { parseSSEJson } from "metabase/api/ai-streaming";
import { api } from "metabase/api/client";
import type {
  HelpAssistantChatRequest,
  HelpAssistantChatResponse,
  HelpAssistantConversation,
  HelpAssistantConversationId,
  HelpAssistantFeedbackRequest,
  HelpAssistantFlagRequest,
  HelpAssistantFlagResponse,
  HelpAssistantSettings,
  HelpAssistantStep,
} from "metabase-types/api";
import { isHelpAssistantStreamEvent } from "metabase-types/guards";

// Saved conversations live in the per-user key-value store, one key per conversation.
const CONVERSATIONS_URL = "/api/user-key-value/namespace/help_assistant";

const CHAT_STREAM_URL = "/api/help-assistant/chat/stream";

/**
 * Asks the assistant and calls `onStep` with each step as it works. Resolves
 * with the answer. Rejects like other API requests, with `{ status, data }`,
 * so errors show the same way.
 */
export async function streamHelpAssistantChat(
  request: HelpAssistantChatRequest,
  {
    signal,
    onStep,
  }: { signal: AbortSignal; onStep: (step: HelpAssistantStep) => void },
): Promise<HelpAssistantChatResponse> {
  const response = await api.fetch({
    method: "POST",
    url: CHAT_STREAM_URL,
    body: request,
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    // ensure we reach the global 401 handler, so the user can sign in if session is expired
    if (response.status === 401) {
      api.emit(401, CHAT_STREAM_URL);
    }
    const data: unknown = await response.json().catch(() => undefined);
    throw { status: response.status, data };
  }
  if (!response.body) {
    throw { status: response.status };
  }

  for await (const event of parseSSEJson(response.body)) {
    if (!isHelpAssistantStreamEvent(event)) {
      continue;
    }
    switch (event.type) {
      case "step":
        onStep(event.step);
        break;
      case "answer": {
        const { reply, sources, steps } = event;
        return { reply, sources, steps };
      }
      case "error":
        throw { status: event.status_code, data: { message: event.message } };
    }
  }
  // The stream ended without an answer, so there's no message to show.
  throw { status: response.status };
}

type HelpAssistantConversations = Record<
  HelpAssistantConversationId,
  HelpAssistantConversation
>;

type SaveConversationRequest = {
  id: HelpAssistantConversationId;
  conversation: HelpAssistantConversation;
};

const helpAssistantApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    sendHelpAssistantFeedback: builder.mutation<
      void,
      HelpAssistantFeedbackRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/help-assistant/feedback",
        body,
      }),
    }),
    getHelpAssistantSettings: builder.query<HelpAssistantSettings, void>({
      query: () => "/api/help-assistant/settings",
    }),
    flagHelpAssistantAnswer: builder.mutation<
      HelpAssistantFlagResponse,
      HelpAssistantFlagRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/help-assistant/flag",
        body,
      }),
    }),
    listHelpAssistantConversations: builder.query<
      HelpAssistantConversations,
      void
    >({
      query: () => CONVERSATIONS_URL,
      // The endpoint has no body when nothing is saved yet.
      transformResponse: (response: HelpAssistantConversations | null) =>
        response ?? {},
    }),
    saveHelpAssistantConversation: builder.mutation<
      void,
      SaveConversationRequest
    >({
      query: ({ id, conversation }) => ({
        method: "PUT",
        url: `${CONVERSATIONS_URL}/key/${id}`,
        body: { value: conversation },
      }),
      onQueryStarted({ id, conversation }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          helpAssistantApi.util.updateQueryData(
            "listHelpAssistantConversations",
            undefined,
            (conversations) => {
              conversations[id] = conversation;
            },
          ),
        );
        queryFulfilled.catch(patch.undo);
      },
    }),
    deleteHelpAssistantConversation: builder.mutation<
      void,
      HelpAssistantConversationId
    >({
      query: (id) => ({
        method: "DELETE",
        url: `${CONVERSATIONS_URL}/key/${id}`,
      }),
      onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          helpAssistantApi.util.updateQueryData(
            "listHelpAssistantConversations",
            undefined,
            (conversations) => {
              delete conversations[id];
            },
          ),
        );
        queryFulfilled.catch(patch.undo);
      },
    }),
  }),
});

export const {
  useSendHelpAssistantFeedbackMutation,
  useGetHelpAssistantSettingsQuery,
  useFlagHelpAssistantAnswerMutation,
  useListHelpAssistantConversationsQuery,
  useSaveHelpAssistantConversationMutation,
  useDeleteHelpAssistantConversationMutation,
} = helpAssistantApi;
