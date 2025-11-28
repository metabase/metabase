import type {
  CreateWorkspaceRequest,
  TransformDownstreamMapping,
  TransformId,
  TransformUpstreamMapping,
  Workspace,
  WorkspaceContents,
  WorkspaceId,
  WorkspaceListResponse,
  WorkspaceMergeResponse,
  WorkspaceUpdateContentsRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceContentItemsTags,
  provideWorkspaceContentsTags,
  provideWorkspaceTags,
  provideWorkspacesTags,
  tag,
} from "./tags";

export const workspaceApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspaces: builder.query<WorkspaceListResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/workspace",
      }),
      providesTags: (response) =>
        response ? provideWorkspacesTags(response.items) : [],
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
        invalidateTags(error, [listTag("workspace"), listTag("transform")]),
    }),
    getWorkspaceContents: builder.query<WorkspaceContents, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}`,
      }),
      transformResponse: (workspace: any) => {
        return {
          contents: workspace?.contents ?? { transforms: [] },
        } as WorkspaceContents;
      },
      providesTags: (workspaceContents) =>
        workspaceContents
          ? provideWorkspaceContentsTags(workspaceContents)
          : [],
    }),
    updateWorkspaceContents: builder.mutation<
      WorkspaceContents,
      WorkspaceUpdateContentsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/contents`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id)]),
    }),
    getTransformUpstreamMapping: builder.query<
      TransformUpstreamMapping,
      TransformId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/mapping/transform/${id}/upstream`,
      }),
      providesTags: (mapping) =>
        mapping?.transform
          ? provideWorkspaceContentItemsTags([mapping.transform])
          : [],
    }),
    getTransformDownstreamMapping: builder.query<
      TransformDownstreamMapping,
      TransformId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/mapping/transform/${id}/downstream`,
      }),
      providesTags: (mapping) =>
        mapping ? provideWorkspaceContentItemsTags(mapping.transforms) : [],
    }),
    mergeWorkspace: builder.mutation<WorkspaceMergeResponse, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/merge`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("workspace"), tag("transform")]),
    }),
    archiveWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/archive`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("workspace"), tag("transform")]),
    }),
  }),
});

export const {
  useGetWorkspacesQuery,
  useGetWorkspaceQuery,
  useCreateWorkspaceMutation,
  useGetWorkspaceContentsQuery,
  useUpdateWorkspaceContentsMutation,
  useLazyGetWorkspaceContentsQuery,
  useGetTransformUpstreamMappingQuery,
  useGetTransformDownstreamMappingQuery,
  useMergeWorkspaceMutation,
  useArchiveWorkspaceMutation,
} = workspaceApi;
