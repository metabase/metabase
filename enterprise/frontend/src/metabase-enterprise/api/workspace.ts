import type {
  CreateWorkspaceRequest,
  CreateWorkspaceTransformRequest,
  CreateWorkspaceTransformResponse,
  TransformDownstreamMapping,
  TransformId,
  TransformUpstreamMapping,
  ValidateTableNameRequest,
  ValidateTableNameResponse,
  Workspace,
  WorkspaceExecuteRequest,
  WorkspaceExecuteResponse,
  WorkspaceId,
  WorkspaceListResponse,
  WorkspaceLogResponse,
  WorkspaceMergeResponse,
  WorkspaceTablesResponse,
  WorkspaceTransformItem,
  WorkspaceTransformsResponse,
  WorkspaceUpdateContentsRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceContentItemsTags,
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
    updateWorkspaceContents: builder.mutation<
      any,
      WorkspaceUpdateContentsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/contents`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id), tag("transform")]),
    }),
    createWorkspaceTransform: builder.mutation<
      CreateWorkspaceTransformResponse,
      { id: WorkspaceId } & CreateWorkspaceTransformRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/transform`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id), tag("transform")]),
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
    validateTableName: builder.mutation<
      ValidateTableNameResponse,
      ValidateTableNameRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/transform/validate/target`,
        body,
      }),
    }),
    updateWorkspaceName: builder.mutation<
      Workspace,
      { id: WorkspaceId; name: string }
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/name`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id)]),
    }),
    getWorkspaceTables: builder.query<WorkspaceTablesResponse, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/tables`,
      }),
      providesTags: (_, __, id) => [idTag("workspace", id)],
    }),
    getWorkspaceTransforms: builder.query<
      WorkspaceTransformItem[],
      WorkspaceId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/transform`,
      }),
      providesTags: (_, __, id) => [idTag("workspace-transforms", id)],
      transformResponse: (response: WorkspaceTransformsResponse) =>
        response.transforms,
    }),
    getWorkspaceLog: builder.query<WorkspaceLogResponse, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/log`,
      }),
      providesTags: (_, _error, id) => [idTag("workspace", id)],
    }),
    executeWorkspace: builder.mutation<
      WorkspaceExecuteResponse,
      WorkspaceExecuteRequest
    >({
      query: ({ id, stale_only }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/execute`,
        params: stale_only ? { stale_only: 1 } : undefined,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id), tag("transform")]),
    }),
  }),
});

export const {
  useGetWorkspacesQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceTransformsQuery,
  useCreateWorkspaceMutation,
  useUpdateWorkspaceContentsMutation,
  useCreateWorkspaceTransformMutation,
  useGetTransformUpstreamMappingQuery,
  useGetTransformDownstreamMappingQuery,
  useMergeWorkspaceMutation,
  useArchiveWorkspaceMutation,
  useValidateTableNameMutation,
  useUpdateWorkspaceNameMutation,
  useGetWorkspaceTablesQuery,
  useGetWorkspaceLogQuery,
  useExecuteWorkspaceMutation,
} = workspaceApi;
