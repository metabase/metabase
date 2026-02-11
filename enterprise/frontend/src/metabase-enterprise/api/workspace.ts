import type {
  CreateWorkspaceRequest,
  CreateWorkspaceTransformRequest,
  CreateWorkspaceTransformResponse,
  ExternalTransformRequest,
  ExternalTransformResponse,
  TransformId,
  UpdateWorkspaceTransformRequest,
  ValidateTableNameRequest,
  ValidateTableNameResponse,
  Workspace,
  WorkspaceAllowedDatabasesResponse,
  WorkspaceCheckoutResponse,
  WorkspaceGraphResponse,
  WorkspaceId,
  WorkspaceListResponse,
  WorkspaceLogResponse,
  WorkspaceMergeResponse,
  WorkspaceProblem,
  WorkspaceRunRequest,
  WorkspaceRunResponse,
  WorkspaceTablesResponse,
  WorkspaceTransform,
  WorkspaceTransformDryRunResponse,
  WorkspaceTransformListItem,
  WorkspaceTransformListResponse,
  WorkspaceTransformMergeResponse,
  WorkspaceTransformRef,
  WorkspaceTransformRunResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorkspaceAllowedDatabaseTags,
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
    createWorkspace: builder.mutation<Workspace, CreateWorkspaceRequest | void>(
      {
        query: (body) => ({
          method: "POST",
          url: "/api/ee/workspace",
          body,
        }),
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("workspace"), listTag("transform")]),
      },
    ),
    updateWorkspace: builder.mutation<
      Workspace,
      { id: WorkspaceId; name?: string; database_id?: number }
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${id}`,
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [idTag("workspace", id)]),
    }),
    createWorkspaceTransform: builder.mutation<
      WorkspaceTransform,
      CreateWorkspaceTransformRequest
    >({
      query: ({ id, ...body }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/transform`,
        body,
      }),
      transformResponse: (
        response: CreateWorkspaceTransformResponse,
      ): WorkspaceTransform => ({
        ...response,
        type: "workspace-transform",
      }),
      invalidatesTags: (_, error, { id, global_id }) =>
        invalidateTags(error, [
          idTag("workspace", id),
          idTag("workspace-transforms", id),
          idTag("external-transform", id),
          idTag("workspace-tables", id),
          listTag("transform"),
          ...(global_id != null ? [idTag("transform", global_id)] : []),
        ]),
    }),
    getWorkspaceCheckout: builder.query<WorkspaceCheckoutResponse, TransformId>(
      {
        query: (transformId) => ({
          method: "GET",
          url: `/api/ee/workspace/checkout`,
          params: { "transform-id": transformId },
        }),
        providesTags: (_, __, transformId) => [idTag("transform", transformId)],
      },
    ),
    mergeWorkspace: builder.mutation<
      WorkspaceMergeResponse,
      { id: WorkspaceId; commit_message: string }
    >({
      query: ({ id, commit_message }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/merge`,
        body: { commit_message },
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("workspace"), tag("transform")]),
    }),
    mergeWorkspaceTransform: builder.mutation<
      WorkspaceTransformMergeResponse,
      WorkspaceTransformRef
    >({
      query: ({ workspaceId, transformId }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}/merge`,
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
    unarchiveWorkspace: builder.mutation<Workspace, WorkspaceId>({
      query: (id) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/unarchive`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("workspace"), tag("transform")]),
    }),
    deleteWorkspace: builder.mutation<void, WorkspaceId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${id}`,
      }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          workspaceApi.util.updateQueryData(
            "getWorkspaces",
            undefined,
            (draft) => {
              const idx = draft.items.findIndex((w) => w.id === id);
              if (idx !== -1) {
                draft.items.splice(idx, 1);
              }
            },
          ),
        );

        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
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
    getWorkspaceTables: builder.query<WorkspaceTablesResponse, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/table`,
      }),
      providesTags: (_, __, id) => [idTag("workspace-tables", id)],
    }),
    getWorkspaceGraph: builder.query<WorkspaceGraphResponse, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/graph`,
      }),
      providesTags: (_, __, id) => [idTag("workspace", id)],
    }),
    getWorkspaceProblems: builder.query<WorkspaceProblem[], WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/problem`,
      }),
      providesTags: (_, __, id) => [idTag("workspace", id)],
    }),
    getWorkspaceTransforms: builder.query<
      WorkspaceTransformListItem[],
      WorkspaceId
    >({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/transform`,
      }),
      providesTags: (_, __, id) => [idTag("workspace-transforms", id)],
      transformResponse: (response: WorkspaceTransformListResponse) =>
        response.transforms,
    }),
    getExternalTransforms: builder.query<
      ExternalTransformResponse["transforms"],
      ExternalTransformRequest
    >({
      query: ({ workspaceId, databaseId }) => ({
        method: "GET",
        url: `/api/ee/workspace/${workspaceId}/external/transform`,
        params: { database_id: databaseId },
      }),
      providesTags: (_, __, { workspaceId: id }) => [
        listTag("external-transform"),
        idTag("external-transform", id),
      ],
      transformResponse: (response: ExternalTransformResponse) =>
        response.transforms,
    }),
    getWorkspaceTransform: builder.query<
      WorkspaceTransform,
      { workspaceId: WorkspaceId; transformId: string }
    >({
      query: ({ workspaceId, transformId }) => ({
        method: "GET",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}`,
      }),
      transformResponse: (
        response: Omit<WorkspaceTransform, "type">,
      ): WorkspaceTransform => ({
        ...response,
        type: "workspace-transform",
      }),
      providesTags: (_, __, { transformId }) => [
        idTag("workspace-transform", transformId),
      ],
    }),
    getWorkspaceLog: builder.query<WorkspaceLogResponse, WorkspaceId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/workspace/${id}/log`,
      }),
      providesTags: (_, _error, id) => [idTag("workspace", id)],
    }),
    runWorkspace: builder.mutation<WorkspaceRunResponse, WorkspaceRunRequest>({
      query: ({ id, stale_only }) => ({
        method: "POST",
        url: `/api/ee/workspace/${id}/run`,
        params: stale_only ? { stale_only: 1 } : undefined,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          idTag("workspace", id),
          idTag("workspace-transforms", id),
          idTag("workspace-tables", id),
          tag("workspace-transform"),
          tag("transform"),
        ]),
    }),
    runWorkspaceTransform: builder.mutation<
      WorkspaceTransformRunResponse,
      WorkspaceTransformRef
    >({
      query: ({ workspaceId, transformId }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}/run`,
      }),
      invalidatesTags: (_, error, { workspaceId, transformId }) =>
        invalidateTags(error, [
          idTag("workspace", workspaceId),
          idTag("workspace-transforms", workspaceId),
          idTag("workspace-transform", transformId),
          idTag("workspace-tables", workspaceId),
        ]),
    }),
    dryRunWorkspaceTransform: builder.mutation<
      WorkspaceTransformDryRunResponse,
      WorkspaceTransformRef
    >({
      query: ({ workspaceId, transformId }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}/dry-run`,
      }),
    }),
    updateWorkspaceTransform: builder.mutation<
      WorkspaceTransform,
      UpdateWorkspaceTransformRequest
    >({
      query: ({ workspaceId, transformId, ...body }) => ({
        method: "PUT",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}`,
        body,
      }),
      transformResponse: (
        response: Omit<WorkspaceTransform, "type">,
      ): WorkspaceTransform => ({
        ...response,
        type: "workspace-transform",
      }),
      invalidatesTags: (_, error, { workspaceId, transformId }) =>
        invalidateTags(error, [
          idTag("workspace", workspaceId),
          idTag("workspace-transforms", workspaceId),
          idTag("workspace-transform", transformId),
          idTag("workspace-tables", workspaceId),
        ]),
    }),
    archiveWorkspaceTransform: builder.mutation<void, WorkspaceTransformRef>({
      query: ({ workspaceId, transformId }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}/archive`,
      }),
      invalidatesTags: (_, error, { workspaceId, transformId }) =>
        invalidateTags(error, [
          idTag("workspace", workspaceId),
          idTag("workspace-transforms", workspaceId),
          idTag("workspace-transform", transformId),
          idTag("workspace-tables", workspaceId),
          tag("transform"),
        ]),
    }),
    unarchiveWorkspaceTransform: builder.mutation<void, WorkspaceTransformRef>({
      query: ({ workspaceId, transformId }) => ({
        method: "POST",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}/unarchive`,
      }),
      invalidatesTags: (_, error, { workspaceId, transformId }) =>
        invalidateTags(error, [
          idTag("workspace", workspaceId),
          idTag("workspace-transforms", workspaceId),
          idTag("workspace-transform", transformId),
          idTag("workspace-tables", workspaceId),
          tag("transform"),
        ]),
    }),
    deleteWorkspaceTransform: builder.mutation<void, WorkspaceTransformRef>({
      query: ({ workspaceId, transformId }) => ({
        method: "DELETE",
        url: `/api/ee/workspace/${workspaceId}/transform/${transformId}`,
      }),
      invalidatesTags: (_, error, { workspaceId, transformId }) =>
        invalidateTags(error, [
          idTag("workspace", workspaceId),
          idTag("workspace-transforms", workspaceId),
          idTag("external-transform", workspaceId),
          idTag("workspace-transform", transformId),
          idTag("workspace-tables", workspaceId),
          tag("transform"),
        ]),
    }),
    getWorkspaceAllowedDatabases: builder.query<
      WorkspaceAllowedDatabasesResponse,
      void
    >({
      query: () => ({
        method: "GET",
        url: `/api/ee/workspace/database`,
      }),
      providesTags: (response) =>
        provideWorkspaceAllowedDatabaseTags(response?.databases ?? []),
    }),
  }),
});

export const {
  useGetWorkspacesQuery,
  useGetWorkspaceQuery,
  useGetWorkspaceTransformsQuery,
  useGetExternalTransformsQuery,
  useGetWorkspaceTransformQuery,
  useCreateWorkspaceMutation,
  useCreateWorkspaceTransformMutation,
  useUpdateWorkspaceTransformMutation,
  useArchiveWorkspaceTransformMutation,
  useUnarchiveWorkspaceTransformMutation,
  useDeleteWorkspaceTransformMutation,
  useGetWorkspaceCheckoutQuery,
  useMergeWorkspaceMutation,
  useMergeWorkspaceTransformMutation,
  useArchiveWorkspaceMutation,
  useUnarchiveWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useValidateTableNameMutation,
  useUpdateWorkspaceMutation,
  useGetWorkspaceTablesQuery,
  useLazyGetWorkspaceTablesQuery,
  useGetWorkspaceGraphQuery,
  useGetWorkspaceProblemsQuery,
  useGetWorkspaceLogQuery,
  useRunWorkspaceMutation,
  useRunWorkspaceTransformMutation,
  useDryRunWorkspaceTransformMutation,
  useGetWorkspaceAllowedDatabasesQuery,
} = workspaceApi;

export const DEFAULT_WORKSPACE_TABLES_QUERY_RESPONSE: WorkspaceTablesResponse =
  {
    inputs: [],
    outputs: [],
  };
