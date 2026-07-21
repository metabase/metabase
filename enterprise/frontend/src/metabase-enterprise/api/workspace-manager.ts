import type {
  CreateWorkspaceRequest,
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
        url: "/api/ee/workspace",
      }),
      providesTags: (workspaces = []) => provideWorkspaceListTags(workspaces),
    }),
    getWorkspace: builder.query<Workspace, WorkspaceId>({
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
    enterWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/enter`,
      }),
    }),
    exitWorkspace: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/workspace/exit",
      }),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useLazyListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useEnterWorkspaceMutation,
  useExitWorkspaceMutation,
} = workspaceManagerApi;
