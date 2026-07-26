import type { CreateWorkspaceRequest, Workspace } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  listTag,
  provideWorkspaceListTags,
  provideWorkspaceTags,
} from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspace: builder.query<Workspace, number>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      providesTags: (result) => (result ? provideWorkspaceTags(result) : []),
    }),
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/workspace`,
      }),
      providesTags: (result) =>
        result ? provideWorkspaceListTags(result) : [listTag("workspace")],
    }),
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/workspace`,
        body,
      }),
      invalidatesTags: () => [listTag("workspace")],
    }),
    deleteWorkspace: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: () => [listTag("workspace")],
    }),
  }),
});

export const {
  useGetWorkspaceQuery,
  useListWorkspacesQuery,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
} = workspaceApi;
