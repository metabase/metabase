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
  provideWorkspaceTags,
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
    getWorkspace: builder.query<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (workspace) =>
        workspace ? provideWorkspaceTags(workspace) : [],
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
      onQueryStarted: async (
        { id, ...patch },
        { dispatch, queryFulfilled },
      ) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            Object.assign(draft, patch);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
    provisionWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/provision`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            draft.databases = draft.databases.map((database) => ({
              ...database,
              status: "provisioning",
            }));
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
    unprovisionWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/unprovision`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
      onQueryStarted: async (id, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData("getWorkspace", id, (draft) => {
            draft.databases = draft.databases.map((database) => ({
              ...database,
              status: "unprovisioning",
            }));
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} = workspaceApi;
