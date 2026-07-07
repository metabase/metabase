import type {
  DeleteSuggestedMetabotPromptRequest,
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
  SuggestedMetabotPromptsRequest,
  SuggestedMetabotPromptsResponse,
  UpdateMetabotSettingsRequest,
  UserMetabotPermissionsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, invalidateTags, listTag } from "./tags";

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
      invalidatesTags: (_, error) =>
        invalidateTags(error, ["session-properties"]),
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
    recordMetabotEntitySaved: builder.mutation<
      { entity_id: string; card_id: number },
      {
        conversation_id: string;
        entity_id: string;
        card_id: number;
      }
    >({
      query: ({ conversation_id, ...body }) => ({
        method: "POST",
        url: `/api/metabot/conversations/${conversation_id}/saved-entity`,
        body,
      }),
      invalidatesTags: (_, error, { card_id }) =>
        invalidateTags(error, [idTag("card", card_id)]),
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
  useListMetabotsQuery,
  useUpdateMetabotSettingsMutation,
  useUpdateMetabotMutation,
  useGetSuggestedMetabotPromptsQuery,
  useDeleteSuggestedMetabotPromptMutation,
  useRegenerateSuggestedMetabotPromptsMutation,
  useLazyMetabotGenerateContentQuery,
  useRecordMetabotEntitySavedMutation,
  useSubmitMetabotFeedbackMutation,
  useSubmitMetabotSourceFeedbackMutation,
  useUpdateMetabotSlackSettingsMutation,
  useGetUserMetabotPermissionsQuery,
} = metabotApi;
