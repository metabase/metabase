import type { CollectionId } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag, provideWorkspaceTags } from "./tags";

export interface Plan {
  title: string;
  description?: string;
  content: any;
  created_at: string;
}

export interface Transform {
  id: string;
  name: string;
  description: string;
  source: any;
  target: any;
  config?: any;
  created_at: string;
}

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  type: string;
  created_at: string;
}

export interface DataWarehouse {
  id: string;
  data_warehouse_id?: number;
  name: string;
  type: "read-only" | "read-write";
  credentials: any;
  created_at: string;
}

export interface Permission {
  id: string;
  table: string;
  permission: "read" | "write";
  created_at: string;
}

export interface Workspace {
  id: number;
  collection_id: CollectionId;
  name: string;
  description?: string | null;
  plans?: Plan[];
  activity_logs?: any[];
  transforms?: Transform[];
  documents?: any[];
  users?: WorkspaceUser[];
  data_warehouses?: DataWarehouse[];
  permissions?: Permission[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  collection_id: CollectionId;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  id: number;
  name: string;
  description?: string;
}

export interface ListWorkspacesResponse {
  data?: Workspace[];
}

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/workspace`,
      }),
      providesTags: (workspaces = []) => provideWorkspaceTags(workspaces),
    }),
    getWorkspace: builder.query<Workspace, number>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (workspace) =>
        workspace ? [idTag("workspace", workspace.id)] : [],
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/workspace`,
        body,
      }),
      invalidatesTags: [listTag("workspace")],
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${id}`,
        body,
      }),
      invalidatesTags: (_, __, { id }) => [
        idTag("workspace", id),
        listTag("workspace"),
      ],
    }),
    deleteWorkspace: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, __, id) => [
        idTag("workspace", id),
        listTag("workspace"),
      ],
    }),
    updatePlan: builder.mutation<
      Workspace,
      { workspaceId: number; planIndex: number; title: string; description?: string; content: any }
    >({
      query: ({ workspaceId, planIndex, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/plan/${planIndex}`,
        body,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    deletePlan: builder.mutation<
      void,
      { workspaceId: number; planIndex: number }
    >({
      query: ({ workspaceId, planIndex }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/plan/${planIndex}`,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    // Transform endpoints
    updateTransform: builder.mutation<
      Workspace,
      { workspaceId: number; transformIndex: number; name: string; description: string; source: any; target: any; config?: any }
    >({
      query: ({ workspaceId, transformIndex, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformIndex}`,
        body,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    deleteTransform: builder.mutation<
      void,
      { workspaceId: number; transformIndex: number }
    >({
      query: ({ workspaceId, transformIndex }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformIndex}`,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    // User endpoints
    updateUser: builder.mutation<
      Workspace,
      { workspaceId: number; userIndex: number; user_id: number; name: string; email: string; type: string }
    >({
      query: ({ workspaceId, userIndex, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/user/${userIndex}`,
        body,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    deleteUser: builder.mutation<
      void,
      { workspaceId: number; userIndex: number }
    >({
      query: ({ workspaceId, userIndex }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/user/${userIndex}`,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    // Data warehouse endpoints
    updateDataWarehouse: builder.mutation<
      Workspace,
      { workspaceId: number; dataWarehouseIndex: number; data_warehouses_id: number; name: string; type: "read-only" | "read-write"; credentials: any }
    >({
      query: ({ workspaceId, dataWarehouseIndex, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/data_warehouse/${dataWarehouseIndex}`,
        body,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    deleteDataWarehouse: builder.mutation<
      void,
      { workspaceId: number; dataWarehouseIndex: number }
    >({
      query: ({ workspaceId, dataWarehouseIndex }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/data_warehouse/${dataWarehouseIndex}`,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    // Permission endpoints
    updatePermission: builder.mutation<
      Workspace,
      { workspaceId: number; permissionIndex: number; table: string; permission: "read" | "write" }
    >({
      query: ({ workspaceId, permissionIndex, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/permission/${permissionIndex}`,
        body,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
    deletePermission: builder.mutation<
      void,
      { workspaceId: number; permissionIndex: number }
    >({
      query: ({ workspaceId, permissionIndex }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/permission/${permissionIndex}`,
      }),
      invalidatesTags: (_, __, { workspaceId }) => [
        idTag("workspace", workspaceId),
        listTag("workspace"),
      ],
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
  useUpdateTransformMutation,
  useDeleteTransformMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateDataWarehouseMutation,
  useDeleteDataWarehouseMutation,
  useUpdatePermissionMutation,
  useDeletePermissionMutation,
} = workspaceApi;