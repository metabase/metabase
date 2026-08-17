import { Api } from "metabase/api";
import { idTag, invalidateTags, listTag } from "metabase/api/tags";
import type {
  Card,
  DeleteSuggestedMetabotPromptRequest,
  ForkMetabotConversationRequest,
  ListMetabotConversationsRequest,
  ListMetabotConversationsResponse,
  MetabotConversationTitleResponse,
  MetabotFeedback,
  MetabotGenerateContentRequest,
  MetabotGenerateContentResponse,
  MetabotId,
  MetabotInfo,
  MetabotProvider,
  MetabotSettingsResponse,
  MetabotSlackSettings,
  MetabotSourceFeedback,
  RegenerateSuggestedMetabotPromptsResponse,
  SaveMetabotEntityRequest,
  SuggestedMetabotPromptsRequest,
  SuggestedMetabotPromptsResponse,
  UpdateMetabotSettingsRequest,
  UserMetabotPermissionsResponse,
} from "metabase-types/api";

import type { MetabotConversationDetail } from "./utils/normalize-fetched-chat-messages";

const touchesCredentials = (body: UpdateMetabotSettingsRequest) =>
  "credentials" in body || "api-key" in body;

export const metabotApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listMetabots: builder.query<{ items: MetabotInfo[] }, void>({
      query: () => ({
        method: "GET",
        url: "/api/metabot/metabot",
      }),
      providesTags: (result) => [
        listTag("metabot"),
        ...(result?.items || []).map((metabot) => idTag("metabot", metabot.id)),
      ],
    }),
    listMetabotConversations: builder.query<
      ListMetabotConversationsResponse,
      ListMetabotConversationsRequest | void
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/metabot/conversations",
        params,
      }),
      providesTags: () => [listTag("metabot-conversations")],
    }),
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
    getMetabotConversationTitle: builder.query<
      MetabotConversationTitleResponse,
      string
    >({
      query: (conversationId) => ({
        method: "GET",
        url: `/api/metabot/conversations/${conversationId}/title`,
      }),
    }),
    getMetabotSettings: builder.query<
      MetabotSettingsResponse,
      { provider: MetabotProvider }
    >({
      query: ({ provider }) => ({
        method: "GET",
        url: "/api/metabot/settings",
        params: { provider },
      }),
      providesTags: () => [listTag("llm-models")],
    }),
    updateMetabotSettings: builder.mutation<
      MetabotSettingsResponse,
      UpdateMetabotSettingsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/metabot/settings",
        body,
      }),
      invalidatesTags: (_, error, body) =>
        invalidateTags(error, [
          "session-properties",
          // A credential write can change which models the provider serves, e.g. a different Bedrock
          // region, Google location, or Azure resource.
          ...(touchesCredentials(body) ? [listTag("llm-models")] : []),
        ]),
    }),
    updateMetabot: builder.mutation<
      MetabotInfo,
      { id: MetabotId } & Partial<
        Pick<MetabotInfo, "use_verified_content" | "collection_id">
      >
    >({
      query: ({ id, ...updates }) => ({
        method: "PUT",
        url: `/api/metabot/metabot/${id}`,
        body: updates,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("metabot"),
          idTag("metabot", id),
          idTag("metabot-prompt-suggestions", id),
        ]),
    }),
    getSuggestedMetabotPrompts: builder.query<
      SuggestedMetabotPromptsResponse,
      SuggestedMetabotPromptsRequest
    >({
      query: ({ metabot_id, ...params }) => ({
        method: "GET",
        url: `/api/metabot/metabot/${metabot_id}/prompt-suggestions`,
        params,
      }),
      providesTags: (_, __, { metabot_id }) => [
        idTag("metabot-prompt-suggestions", metabot_id),
      ],
    }),
    deleteSuggestedMetabotPrompt: builder.mutation<
      void,
      DeleteSuggestedMetabotPromptRequest
    >({
      query: ({ metabot_id, prompt_id }) => ({
        method: "DELETE",
        url: `/api/metabot/metabot/${metabot_id}/prompt-suggestions/${prompt_id}`,
      }),
      invalidatesTags: (_, error, { metabot_id }) =>
        invalidateTags(error, [
          idTag("metabot-prompt-suggestions", metabot_id),
        ]),
    }),
    regenerateSuggestedMetabotPrompts: builder.mutation<
      RegenerateSuggestedMetabotPromptsResponse,
      MetabotId
    >({
      query: (metabot_id) => ({
        method: "POST",
        url: `/api/metabot/metabot/${metabot_id}/prompt-suggestions/regenerate`,
      }),
      invalidatesTags: (_, error, metabot_id) =>
        invalidateTags(error, [
          idTag("metabot-prompt-suggestions", metabot_id),
        ]),
    }),
    metabotGenerateContent: builder.query<
      MetabotGenerateContentResponse,
      MetabotGenerateContentRequest
    >({
      query: (params) => ({
        method: "POST",
        url: "/api/metabot/document/generate-content",
        body: params,
      }),
    }),
    saveMetabotEntity: builder.mutation<Card, SaveMetabotEntityRequest>({
      query: ({ conversation_id, ...body }) => ({
        method: "POST",
        url: `/api/metabot/conversations/${conversation_id}/saved-entity`,
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [listTag("card")]),
    }),
    submitMetabotFeedback: builder.mutation<void, MetabotFeedback>({
      query: (params) => ({
        method: "POST",
        url: "/api/metabot/feedback",
        body: params,
      }),
    }),
    submitMetabotSourceFeedback: builder.mutation<void, MetabotSourceFeedback>({
      query: (params) => ({
        method: "POST",
        url: "/api/metabot/source-feedback",
        body: params,
      }),
    }),
    updateMetabotSlackSettings: builder.mutation<
      { ok: boolean },
      MetabotSlackSettings
    >({
      query: (settings) => ({
        method: "PUT",
        url: "/api/metabot/slack/settings",
        body: settings,
      }),
      invalidatesTags: ["session-properties"],
    }),
    getUserMetabotPermissions: builder.query<
      UserMetabotPermissionsResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/metabot/permissions/user-permissions",
      }),
      providesTags: () => [listTag("metabot-permissions")],
    }),
  }),
});

export const {
  useGetMetabotSettingsQuery,
  useGetMetabotConversationQuery,
  useForkMetabotConversationMutation,
  useListMetabotConversationsQuery,
  useListMetabotsQuery,
  useUpdateMetabotSettingsMutation,
  useUpdateMetabotMutation,
  useGetSuggestedMetabotPromptsQuery,
  useDeleteSuggestedMetabotPromptMutation,
  useRegenerateSuggestedMetabotPromptsMutation,
  useLazyMetabotGenerateContentQuery,
  useSaveMetabotEntityMutation,
  useSubmitMetabotFeedbackMutation,
  useSubmitMetabotSourceFeedbackMutation,
  useUpdateMetabotSlackSettingsMutation,
  useGetUserMetabotPermissionsQuery,
} = metabotApi;
