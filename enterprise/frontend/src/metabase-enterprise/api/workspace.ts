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

export const workspaceApi = EnterpriseApi.injectEndpoints({
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
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace-manager/${id}/database`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    updateWorkspaceDatabase: builder.mutation<
      Workspace,
      UpdateWorkspaceDatabaseRequest
    >({
      query: ({ id, database_id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/${id}/database/${database_id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    deleteWorkspaceDatabase: builder.mutation<
      Workspace,
      DeleteWorkspaceDatabaseRequest
    >({
      query: ({ id, database_id }) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${id}/database/${database_id}`,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useLazyGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useCreateWorkspaceDatabaseMutation,
  useUpdateWorkspaceDatabaseMutation,
  useDeleteWorkspaceDatabaseMutation,
} = workspaceApi;
