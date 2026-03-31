import type {
  DeleteSuggestedMetabotPromptRequest,
  MetabotFeedback,
  MetabotGenerateContentRequest,
  MetabotGenerateContentResponse,
  MetabotGroupLimit,
  MetabotId,
  MetabotInfo,
  MetabotInstanceLimit,
  MetabotPermissionsResponse,
  MetabotProvider,
  MetabotSettingsResponse,
  MetabotSlackSettings,
  MetabotTenantLimit,
  SuggestedMetabotPromptsRequest,
  SuggestedMetabotPromptsResponse,
  UpdateMetabotPermissionsRequest,
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
      providesTags: () => [listTag("llm-models"), "session-properties"],
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
        invalidateTags(error, [listTag("llm-models"), "session-properties"]),
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
    regenerateSuggestedMetabotPrompts: builder.mutation<void, MetabotId>({
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
        url: "/api/metabot/document/native-generate-content",
        body: params,
      }),
    }),
    submitMetabotFeedback: builder.mutation<void, MetabotFeedback>({
      query: (params) => ({
        method: "POST",
        url: "/api/metabot/feedback",
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
    getMetabotPermissions: builder.query<MetabotPermissionsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/metabot/permissions",
      }),
      providesTags: () => [listTag("metabot-permissions")],
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
    updateMetabotPermissions: builder.mutation<
      void,
      UpdateMetabotPermissionsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/metabot/permissions",
        body,
      }),
      invalidatesTags: [listTag("metabot-permissions")],
    }),

    // Usage limits endpoints
    getMetabotInstanceLimit: builder.query<MetabotInstanceLimit, void>({
      query: () => ({
        method: "GET",
        url: "/api/metabot/usage/instance",
      }),
      providesTags: () => [listTag("metabot-usage-instance-limit")],
    }),
    updateMetabotInstanceLimit: builder.mutation<
      MetabotInstanceLimit,
      MetabotInstanceLimit
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/metabot/usage/instance",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metabot-usage-instance-limit")]),
    }),
    getMetabotGroupLimits: builder.query<MetabotGroupLimit[], void>({
      query: () => ({
        method: "GET",
        url: "/api/metabot/usage/group",
      }),
      providesTags: () => [listTag("metabot-usage-group-limits")],
    }),
    updateMetabotGroupLimit: builder.mutation<
      MetabotGroupLimit,
      { groupId: number; max_usage: number | null }
    >({
      query: ({ groupId, max_usage }) => ({
        method: "PUT",
        url: `/api/metabot/usage/group/${groupId}`,
        body: { max_usage },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metabot-usage-group-limits")]),
    }),
    getMetabotTenantLimits: builder.query<MetabotTenantLimit[], void>({
      query: () => ({
        method: "GET",
        url: "/api/metabot/usage/tenant",
      }),
      providesTags: () => [listTag("metabot-usage-tenant-limits")],
    }),
    updateMetabotTenantLimit: builder.mutation<
      MetabotTenantLimit,
      { tenantId: number; max_usage: number | null }
    >({
      query: ({ tenantId, max_usage }) => ({
        method: "PUT",
        url: `/api/metabot/usage/tenant/${tenantId}`,
        body: { max_usage },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("metabot-usage-tenant-limits")]),
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
  useSubmitMetabotFeedbackMutation,
  useUpdateMetabotSlackSettingsMutation,
  useGetMetabotPermissionsQuery,
  useGetUserMetabotPermissionsQuery,
  useUpdateMetabotPermissionsMutation,
  useGetMetabotInstanceLimitQuery,
  useUpdateMetabotInstanceLimitMutation,
  useGetMetabotGroupLimitsQuery,
  useUpdateMetabotGroupLimitMutation,
  useGetMetabotTenantLimitsQuery,
  useUpdateMetabotTenantLimitMutation,
} = metabotApi;
