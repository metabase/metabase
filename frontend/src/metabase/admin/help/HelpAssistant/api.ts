import { Api } from "metabase/api";
import type {
  HelpAssistantChatRequest,
  HelpAssistantChatResponse,
  HelpAssistantConversation,
  HelpAssistantConversationId,
  HelpAssistantFeedbackRequest,
} from "metabase-types/api";

// Saved conversations live in the per-user key-value store, one key per conversation.
const CONVERSATIONS_URL = "/api/user-key-value/namespace/help_assistant";

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
    sendHelpAssistantMessage: builder.mutation<
      HelpAssistantChatResponse,
      HelpAssistantChatRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/help-assistant/chat",
        body,
      }),
    }),
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
  useSendHelpAssistantMessageMutation,
  useSendHelpAssistantFeedbackMutation,
  useListHelpAssistantConversationsQuery,
  useSaveHelpAssistantConversationMutation,
  useDeleteHelpAssistantConversationMutation,
} = helpAssistantApi;
