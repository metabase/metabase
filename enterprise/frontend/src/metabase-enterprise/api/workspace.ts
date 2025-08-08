import type { CollectionId } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag, provideWorkspaceTags } from "./tags";

export interface Workspace {
  id: number;
  collection_id: CollectionId;
  name: string;
  description?: string | null;
  plans?: any[];
  activity_logs?: any[];
  transforms?: any[];
  documents?: any[];
  users?: any[];
  data_warehouses?: any[];
  permissions?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  collection_id: CollectionId;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  id: number;
  name: string;
  description?: string;
}

export interface ListWorkspacesResponse {
  data?: Workspace[];
}

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaces: builder.query<Workspace[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/workspace`,
      }),
      providesTags: (workspaces = []) => provideWorkspaceTags(workspaces),
    }),
    getWorkspace: builder.query<Workspace, number>({
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
        url: `/api/ee/workspace`,
        body,
      }),
      invalidatesTags: [listTag("workspace")],
    }),
    updateWorkspace: builder.mutation<Workspace, UpdateWorkspaceRequest>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${id}`,
        body,
      }),
      invalidatesTags: (_, __, { id }) => [
        idTag("workspace", id),
        listTag("workspace"),
      ],
    }),
    deleteWorkspace: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      invalidatesTags: (_, __, id) => [
        idTag("workspace", id),
        listTag("workspace"),
      ],
    }),
  }),
});

export const {
  useListWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useDeleteWorkspaceMutation,
} = workspaceApi;