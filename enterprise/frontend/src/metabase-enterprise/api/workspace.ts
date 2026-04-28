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
} from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace",
      }),
      providesTags: (workspaces = []) => provideWorkspaceListTags(workspaces),
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("workspace")]),
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    createWorkspaceDatabase: builder.mutation<
      Workspace,
      CreateWorkspaceDatabaseRequest
    >({
      query: ({ workspaceId, database_id, input_schemas }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/database`,
        body: { database_id, input_schemas },
      }),
      invalidatesTags: (_, error, { workspaceId }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspaceId),
        ]),
    }),
    updateWorkspaceDatabase: builder.mutation<
      Workspace,
      UpdateWorkspaceDatabaseRequest
    >({
      query: ({ workspaceId, database_id, input_schemas }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/database/${database_id}`,
        body: { input_schemas },
      }),
      invalidatesTags: (_, error, { workspaceId }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspaceId),
        ]),
    }),
    deleteWorkspaceDatabase: builder.mutation<
      Workspace,
      DeleteWorkspaceDatabaseRequest
    >({
      query: ({ workspaceId, database_id }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/database/${database_id}`,
      }),
      invalidatesTags: (_, error, { workspaceId }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", workspaceId),
        ]),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useCreateWorkspaceDatabaseMutation,
  useUpdateWorkspaceDatabaseMutation,
  useDeleteWorkspaceDatabaseMutation,
} = workspaceApi;
