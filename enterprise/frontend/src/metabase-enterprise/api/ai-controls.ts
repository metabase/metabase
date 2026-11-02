import type {
  McpToolPermissionsResponse,
  MetabotGroupLimit,
  MetabotInstanceLimit,
  MetabotPermissionsResponse,
  MetabotTenantLimit,
  UpdateMcpToolPermissionsRequest,
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
    getMcpToolPermissions: builder.query<McpToolPermissionsResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/ai-controls/mcp-permissions",
      }),
      providesTags: () => [listTag("ai-controls-mcp-permissions")],
    }),
    updateMcpToolPermissions: builder.mutation<
      McpToolPermissionsResponse,
      UpdateMcpToolPermissionsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/ai-controls/mcp-permissions",
        body,
      }),
      // The PUT answers with the GET body; a refetch would show the pre-save state first.
      onQueryStarted: async (_body, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            aiControlsApi.util.updateQueryData(
              "getMcpToolPermissions",
              undefined,
              () => data,
            ),
          );
        } catch {
          // the caller's unwrap() reports the failure
        }
      },
    }),
    enableAdvancedMcpToolPermissions: builder.mutation<
      McpToolPermissionsResponse,
      void
    >({
      query: () => ({
        method: "POST",
        url: "/api/ee/ai-controls/mcp-permissions/advanced",
      }),
      invalidatesTags: [listTag("ai-controls-mcp-permissions")],
    }),
    disableAdvancedMcpToolPermissions: builder.mutation<
      McpToolPermissionsResponse,
      void
    >({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/ai-controls/mcp-permissions/advanced",
      }),
      invalidatesTags: [listTag("ai-controls-mcp-permissions")],
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
  useGetMcpToolPermissionsQuery,
  useUpdateMcpToolPermissionsMutation,
  useEnableAdvancedMcpToolPermissionsMutation,
  useDisableAdvancedMcpToolPermissionsMutation,
  useGetAIControlsInstanceLimitQuery,
  useUpdateAIControlsInstanceLimitMutation,
  useGetAIControlsGroupLimitsQuery,
  useUpdateAIControlsGroupLimitMutation,
  useGetAIControlsTenantLimitsQuery,
  useUpdateAIControlsTenantLimitMutation,
} = aiControlsApi;
