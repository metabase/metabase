import type {
  CreateWorkspaceAccessKeyRequest,
  CreateWorkspaceDatabaseRequest,
  CreateWorkspaceRequest,
  DeleteWorkspaceAccessKeyRequest,
  DeleteWorkspaceDatabaseRequest,
  UpdateWorkspaceAccessKeyRequest,
  UpdateWorkspaceDatabaseRequest,
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceAccessKey,
  WorkspaceAccessKeyWithSecret,
  WorkspaceId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceListTags,
  provideWorkspaceTags,
} from "./tags";

export const workspaceManagerApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-manager",
      }),
      providesTags: (workspaces = []) => provideWorkspaceListTags(workspaces),
    }),
    getWorkspace: builder.query<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace-manager/${id}`,
      }),
      providesTags: (workspace) =>
        workspace ? provideWorkspaceTags(workspace) : [],
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace-manager",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("workspace")]),
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    createWorkspaceDatabase: builder.mutation<
      Workspace,
      CreateWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id, input_schemas }) => ({
        method: "POST",
        url: `/api/ee/workspace-manager/${workspace_id}/database`,
        body: { database_id, input_schemas },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    updateWorkspaceDatabase: builder.mutation<
      Workspace,
      UpdateWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id, input_schemas }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/${workspace_id}/database/${database_id}`,
        body: { input_schemas },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    deleteWorkspaceDatabase: builder.mutation<
      Workspace,
      DeleteWorkspaceDatabaseRequest
    >({
      query: ({ workspace_id, database_id }) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${workspace_id}/database/${database_id}`,
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    createWorkspaceAccessKey: builder.mutation<
      WorkspaceAccessKeyWithSecret,
      CreateWorkspaceAccessKeyRequest
    >({
      query: ({ workspace_id, name }) => ({
        method: "POST",
        url: `/api/ee/workspace-manager/${workspace_id}/access-key`,
        body: { name },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    updateWorkspaceAccessKey: builder.mutation<
      WorkspaceAccessKey,
      UpdateWorkspaceAccessKeyRequest
    >({
      query: ({ workspace_id, id, name }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/${workspace_id}/access-key/${id}`,
        body: { name },
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    deleteWorkspaceAccessKey: builder.mutation<
      { id: number; deleted: boolean },
      DeleteWorkspaceAccessKeyRequest
    >({
      query: ({ workspace_id, id }) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${workspace_id}/access-key/${id}`,
      }),
      invalidatesTags: (_, error, { workspace_id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useCreateWorkspaceDatabaseMutation,
  useUpdateWorkspaceDatabaseMutation,
  useDeleteWorkspaceDatabaseMutation,
  useCreateWorkspaceAccessKeyMutation,
  useUpdateWorkspaceAccessKeyMutation,
  useDeleteWorkspaceAccessKeyMutation,
} = workspaceManagerApi;
