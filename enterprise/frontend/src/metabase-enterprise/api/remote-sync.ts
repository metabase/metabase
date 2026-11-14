import { provideRemoteSyncContentTags } from "metabase/api/tags";
import type {
  CreateRemoteSyncBranchRequest,
  CreateRemoteSyncBranchResponse,
  CreateWorktreeRequest,
  ExportChangesRequest,
  ExportChangesResponse,
  ExportPreflightRequest,
  ExportPreflightResponse,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportChangesRequest,
  ImportChangesResponse,
  RemoteSyncChangesResponse,
  RemoteSyncIsDirtyResponse,
  RemoteSyncTask,
  StashChangesRequest,
  StashChangesResponse,
  TestRemoteSyncConnectionRequest,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncSettingsRequest,
  UpdateRemoteSyncSettingsResponse,
  Worktree,
  WorktreeId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags, listTag, tag } from "./tags";

export const remoteSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRemoteSyncChanges: builder.query<RemoteSyncChangesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/dirty",
      }),
      providesTags: () => [
        tag("remote-sync-changes"),
        ...provideRemoteSyncContentTags(),
      ],
    }),
    getRemoteSyncIsDirty: builder.query<RemoteSyncIsDirtyResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/is-dirty",
      }),
      providesTags: () => [
        tag("remote-sync-changes"),
        ...provideRemoteSyncContentTags(),
      ],
    }),
    getHasRemoteChanges: builder.query<HasRemoteChangesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/has-remote-changes",
      }),
      providesTags: () => [tag("remote-sync-remote-changes")],
    }),
    getExportPreflight: builder.query<
      ExportPreflightResponse,
      ExportPreflightRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/remote-sync/export-preflight",
        params,
      }),
      providesTags: () => [
        tag("remote-sync-remote-changes"),
        tag("remote-sync-changes"),
        ...provideRemoteSyncContentTags(),
      ],
    }),
    getRemoteSyncCurrentTask: builder.query<RemoteSyncTask | null, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/current-task",
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    getRemoteSyncBranches: builder.query<GetBranchesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/branches",
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
    exportChanges: builder.mutation<
      ExportChangesResponse,
      ExportChangesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/export",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("remote-sync-current-task")]),
    }),
    importChanges: builder.mutation<
      ImportChangesResponse,
      ImportChangesRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/import",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("remote-sync-current-task")]),
    }),
    stashChanges: builder.mutation<StashChangesResponse, StashChangesRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/stash",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("remote-sync-current-task"),
          tag("remote-sync-branches"),
        ]),
    }),
    updateRemoteSyncSettings: builder.mutation<
      UpdateRemoteSyncSettingsResponse,
      UpdateRemoteSyncSettingsRequest
    >({
      query: (body) => ({
        method: "PUT",
        url: "/api/ee/remote-sync/settings",
        body,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("session-properties"),
          listTag("collection"),
          tag("remote-sync-branches"),
          tag("remote-sync-changes"),
          tag("remote-sync-current-task"),
          tag("remote-sync-remote-changes"),
        ]),
    }),
    cancelRemoteSyncCurrentTask: builder.mutation<RemoteSyncTask, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/remote-sync/current-task/cancel",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("remote-sync-current-task")]),
    }),
    listWorktrees: builder.query<Worktree[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/remote-sync/worktree",
      }),
      providesTags: () => [listTag("remote-sync-worktree")],
    }),
    getWorktree: builder.query<Worktree, WorktreeId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/remote-sync/worktree/${id}`,
      }),
      providesTags: (_worktree, _error, id) => [
        idTag("remote-sync-worktree", id),
      ],
    }),
    createWorktree: builder.mutation<Worktree, CreateWorktreeRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/worktree",
        body,
      }),
      invalidatesTags: (_worktree, error) =>
        invalidateTags(error, [listTag("remote-sync-worktree")]),
    }),
    deleteWorktree: builder.mutation<void, WorktreeId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/remote-sync/worktree/${id}`,
      }),
      invalidatesTags: (_result, error, id) =>
        invalidateTags(error, [
          listTag("remote-sync-worktree"),
          idTag("remote-sync-worktree", id),
        ]),
    }),
    createRemoteSyncBranch: builder.mutation<
      CreateRemoteSyncBranchResponse,
      CreateRemoteSyncBranchRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/branch",
        body,
      }),
      invalidatesTags: (_branch, error) =>
        invalidateTags(error, [tag("remote-sync-branches")]),
    }),
    testRemoteSyncConnection: builder.mutation<
      TestRemoteSyncConnectionResponse,
      TestRemoteSyncConnectionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/remote-sync/test-connection",
        body,
      }),
    }),
  }),
});

export const {
  useGetRemoteSyncChangesQuery,
  useGetRemoteSyncIsDirtyQuery,
  useLazyGetRemoteSyncIsDirtyQuery,
  useGetHasRemoteChangesQuery,
  useGetExportPreflightQuery,
  useGetRemoteSyncCurrentTaskQuery,
  useGetRemoteSyncBranchesQuery,
  useExportChangesMutation,
  useImportChangesMutation,
  useStashChangesMutation,
  useUpdateRemoteSyncSettingsMutation,
  useCancelRemoteSyncCurrentTaskMutation,
  useTestRemoteSyncConnectionMutation,
  useListWorktreesQuery,
  useGetWorktreeQuery,
  useCreateWorktreeMutation,
  useDeleteWorktreeMutation,
  useCreateRemoteSyncBranchMutation,
} = remoteSyncApi;
