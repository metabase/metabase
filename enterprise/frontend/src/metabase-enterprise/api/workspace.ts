import type {
  CreateWorkspaceDatabaseRequest,
  CreateWorkspaceInstanceRequest,
  CreateWorkspaceRequest,
  DeleteWorkspaceDatabaseRequest,
  UpdateWorkspaceDatabaseRequest,
  UpdateWorkspaceInstanceRequest,
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceId,
  WorkspaceInstance,
  WorkspaceInstanceId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceInstanceListTags,
  provideWorkspaceInstanceTags,
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
    listWorkspaceInstances: builder.query<WorkspaceInstance[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace-manager/instance",
      }),
      providesTags: (instances = []) =>
        provideWorkspaceInstanceListTags(instances),
    }),
    createWorkspaceInstance: builder.mutation<
      WorkspaceInstance,
      CreateWorkspaceInstanceRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace-manager/instance",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("workspace-instance")]),
    }),
    updateWorkspaceInstance: builder.mutation<
      WorkspaceInstance,
      UpdateWorkspaceInstanceRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/instance/${id}`,
        body,
      }),
      invalidatesTags: (instance, error) =>
        invalidateTags(
          error,
          instance
            ? [
                listTag("workspace-instance"),
                ...provideWorkspaceInstanceTags(instance),
              ]
            : [listTag("workspace-instance")],
        ),
    }),
    deleteWorkspaceInstance: builder.mutation<void, WorkspaceInstanceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/instance/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("workspace-instance"),
          idTag("workspace-instance", id),
        ]),
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
  useListWorkspaceInstancesQuery,
  useCreateWorkspaceInstanceMutation,
  useUpdateWorkspaceInstanceMutation,
  useDeleteWorkspaceInstanceMutation,
} = workspaceApi;
