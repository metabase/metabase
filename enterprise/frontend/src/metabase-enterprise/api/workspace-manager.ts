import type {
  CreateWorkspaceInstanceRequest,
  CreateWorkspaceRequest,
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse,
  TestWorkspaceInstanceConnectionRequest,
  TestWorkspaceInstanceConnectionResponse,
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
        invalidateTags(error, [
          listTag("workspace"),
          // creating with an instance_id assigns that instance
          listTag("workspace-instance"),
        ]),
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace-manager/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", id),
          // assigning/releasing an instance changes the instance list too
          listTag("workspace-instance"),
        ]),
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
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", id),
          // deleting a workspace frees its assigned instance
          listTag("workspace-instance"),
        ]),
    }),
    pushWorkspaceConfig: builder.mutation<WorkspaceInstance, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace-manager/${id}/push-config`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("workspace"),
          idTag("workspace", id),
          listTag("workspace-instance"),
        ]),
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
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("workspace-instance"),
          idTag("workspace-instance", id),
          // workspaces embed an instance summary
          listTag("workspace"),
        ]),
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
          listTag("workspace"),
        ]),
    }),
    testWorkspaceInstanceConnection: builder.mutation<
      TestWorkspaceInstanceConnectionResponse,
      TestWorkspaceInstanceConnectionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/workspace-manager/instance/test",
        body,
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
  usePushWorkspaceConfigMutation,
  useListWorkspaceInstancesQuery,
  useCreateWorkspaceInstanceMutation,
  useUpdateWorkspaceInstanceMutation,
  useDeleteWorkspaceInstanceMutation,
  useTestWorkspaceInstanceConnectionMutation,
} = workspaceManagerApi;
