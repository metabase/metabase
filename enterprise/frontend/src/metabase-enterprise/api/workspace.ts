import type {
  CreateWorkspaceRequest,
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
        url: "/api/ee/workspace-manager",
      }),
      providesTags: (workspaces = []) => provideWorkspaceListTags(workspaces),
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
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace-manager/${id}`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [listTag("workspace"), idTag("workspace", id)]),
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
} = workspaceApi;
