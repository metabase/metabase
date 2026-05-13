import type {
  MetabotGroupLimit,
  MetabotInstanceLimit,
  MetabotPermissionsResponse,
  MetabotTenantLimit,
  UpdateMetabotPermissionsRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, listTag } from "./tags";

export const aiControlsApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAIControlsGroupPermissions: builder.query<
      MetabotPermissionsResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/ai-controls/permissions",
      }),
      providesTags: () => [listTag("ai-controls-permissions")],
    }),
    updateAIControlsGroupPermissions: builder.mutation<
      void,
      UpdateMetabotPermissionsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/ai-controls/permissions",
        body,
      }),
      invalidatesTags: [listTag("ai-controls-permissions")],
    }),
    enableAdvancedAIControlsPermissions: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/ai-controls/permissions/advanced",
      }),
      invalidatesTags: [listTag("ai-controls-permissions")],
    }),
    disableAdvancedAIControlsPermissions: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/ai-controls/permissions/advanced",
      }),
      invalidatesTags: [listTag("ai-controls-permissions")],
    }),
    getAIControlsInstanceLimit: builder.query<MetabotInstanceLimit, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/ai-controls/usage/instance",
      }),
      providesTags: () => [listTag("ai-controls-usage-instance-limit")],
    }),
    updateAIControlsInstanceLimit: builder.mutation<
      MetabotInstanceLimit,
      MetabotInstanceLimit
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/ai-controls/usage/instance",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("ai-controls-usage-instance-limit")]),
    }),
    getAIControlsGroupLimits: builder.query<MetabotGroupLimit[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/ai-controls/usage/group",
      }),
      providesTags: () => [listTag("ai-controls-usage-group-limits")],
    }),
    updateAIControlsGroupLimit: builder.mutation<
      MetabotGroupLimit,
      { groupId: number; max_usage: number | null }
    >({
      query: ({ groupId, max_usage }) => ({
        method: "PUT",
        url: `/api/ee/ai-controls/usage/group/${groupId}`,
        body: { max_usage },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("ai-controls-usage-group-limits")]),
    }),
    getAIControlsTenantLimits: builder.query<MetabotTenantLimit[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/ai-controls/usage/tenant",
      }),
      providesTags: () => [listTag("ai-controls-usage-tenant-limits")],
    }),
    updateAIControlsTenantLimit: builder.mutation<
      MetabotTenantLimit,
      { tenantId: number; max_usage: number | null }
    >({
      query: ({ tenantId, max_usage }) => ({
        method: "PUT",
        url: `/api/ee/ai-controls/usage/tenant/${tenantId}`,
        body: { max_usage },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("ai-controls-usage-tenant-limits")]),
    }),
  }),
});

export const {
  useGetAIControlsGroupPermissionsQuery,
  useUpdateAIControlsGroupPermissionsMutation,
  useEnableAdvancedAIControlsPermissionsMutation,
  useDisableAdvancedAIControlsPermissionsMutation,
  useGetAIControlsInstanceLimitQuery,
  useUpdateAIControlsInstanceLimitMutation,
  useGetAIControlsGroupLimitsQuery,
  useUpdateAIControlsGroupLimitMutation,
  useGetAIControlsTenantLimitsQuery,
  useUpdateAIControlsTenantLimitMutation,
} = aiControlsApi;
