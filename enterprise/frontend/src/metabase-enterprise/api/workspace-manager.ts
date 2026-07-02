import type {
  CreateWorkspaceRequest,
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse,
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
        workspace ? [idTag("workspace", workspace.id)] : [],
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
    deleteWorkspace: builder.mutation<
      DeleteWorkspaceResponse,
      DeleteWorkspaceRequest
    >({
      query: ({ id, ignorePending }) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${id}`,
        params: ignorePending ? { "ignore-pending": true } : undefined,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
} = workspaceManagerApi;
