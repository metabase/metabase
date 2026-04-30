import type {
  CreateWorkspaceDatabaseRequest,
  CreateWorkspaceRequest,
  DeleteWorkspaceDatabaseRequest,
  UpdateWorkspaceDatabaseRequest,
  UpdateWorkspaceRequest,
  Workspace,
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
    setWorkspaceSharingKey: builder.mutation<
      { sharing_key: string },
      WorkspaceId
    >({
      query: (workspace_id) => ({
        method: "POST",
        url: `/api/ee/workspace-manager/${workspace_id}/sharing-key`,
      }),
      invalidatesTags: (_, error, workspace_id) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspace_id),
        ]),
    }),
    deleteWorkspaceSharingKey: builder.mutation<
      { sharing_key: null },
      WorkspaceId
    >({
      query: (workspace_id) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${workspace_id}/sharing-key`,
      }),
      invalidatesTags: (_, error, workspace_id) =>
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
  useSetWorkspaceSharingKeyMutation,
  useDeleteWorkspaceSharingKeyMutation,
} = workspaceManagerApi;
