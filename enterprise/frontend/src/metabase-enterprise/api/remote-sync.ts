import type {
  CreateBranchRequest,
  ExportChangesRequest,
  ExportChangesResponse,
  ExportPreflightResponse,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportFromBranchRequest,
  ImportFromBranchResponse,
  RemoteSyncChangesResponse,
  RemoteSyncConfigurationSettings,
  RemoteSyncHasChangesResponse,
  RemoteSyncTask,
  StashChangesRequest,
  StashChangesResponse,
  SwitchBranchRequest,
  SwitchBranchResponse,
  TestRemoteSyncConnectionRequest,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncConfigurationResponse,
  Worktree,
} from "metabase-types/api";
import type {
  CreateWorktreeRequest,
  WorktreeId,
} from "metabase-types/api/worktree";

import { EnterpriseApi } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideWorktreeListTags,
  provideWorktreeTags,
  tag,
} from "./tags";

export const remoteSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    exportChanges: builder.mutation<
      ExportChangesResponse,
      ExportChangesRequest
    >({
      query: ({ message, force, branch, merge, worktree_id }) => ({
        url: `/api/ee/remote-sync/export`,
        method: "POST",
        body: {
          message,
          branch,
          force,
          merge,
          worktree_id,
        },
      }),
      invalidatesTags: () => [
        tag("collection-dirty-entities"),
        tag("session-properties"),
      ],
    }),
    getExportPreflight: builder.query<
      ExportPreflightResponse,
      { branch: string; "worktree-id"?: WorktreeId | null }
    >({
      query: (params) => ({
        url: `/api/ee/remote-sync/export-preflight`,
        method: "GET",
        params,
      }),
      providesTags: () => [tag("remote-sync-has-remote-changes")],
    }),
    importChanges: builder.mutation<
      ImportFromBranchResponse,
      ImportFromBranchRequest
    >({
      query: ({ force, merge, expected_branch, worktree_id }) => ({
        url: `/api/ee/remote-sync/import`,
        method: "POST",
        body: {
          force,
          merge,
          expected_branch,
          worktree_id,
        },
      }),
      /**
       * Tags invalidation for import happens in the middleware after the import task is successful.
       * @see remote-sync-middleware.ts
       */
    }),
    switchBranch: builder.mutation<SwitchBranchResponse, SwitchBranchRequest>({
      query: ({ branch, force, merge, expected_branch }) => ({
        url: `/api/ee/remote-sync/switch-branch`,
        method: "POST",
        body: {
          branch,
          force,
          merge,
          expected_branch,
        },
      }),
      /**
       * Tags invalidation for a branch switch happens in the middleware after the task is successful,
       * same as import.
       * @see remote-sync-middleware.ts
       */
    }),
    stashChanges: builder.mutation<StashChangesResponse, StashChangesRequest>({
      query: ({ new_branch, message }) => ({
        url: `/api/ee/remote-sync/stash`,
        method: "POST",
        body: {
          new_branch,
          message,
        },
      }),
      invalidatesTags: () => [
        tag("collection-dirty-entities"),
        tag("session-properties"),
      ],
    }),
    getRemoteSyncChanges: builder.query<
      RemoteSyncChangesResponse,
      { "worktree-id": WorktreeId } | void
    >({
      query: (params) => ({
        url: `/api/ee/remote-sync/dirty`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: () => [tag("collection-dirty-entities")],
      transformResponse: (response: RemoteSyncChangesResponse) => {
        const collectionMap: Record<number, boolean> = {};
        response.dirty.forEach((entity) => {
          if (entity.collection_id) {
            collectionMap[entity.collection_id] = true;
          }
        });
        return {
          dirty: response.dirty,
          changedCollections: collectionMap,
        };
      },
    }),
    getRemoteSyncHasChanges: builder.query<
      RemoteSyncHasChangesResponse,
      { "worktree-id": WorktreeId } | void
    >({
      query: (params) => ({
        url: `/api/ee/remote-sync/is-dirty`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: () => [tag("collection-is-dirty")],
    }),
    getHasRemoteChanges: builder.query<
      HasRemoteChangesResponse,
      { "worktree-id": WorktreeId } | void
    >({
      query: (params) => ({
        url: `/api/ee/remote-sync/has-remote-changes`,
        method: "GET",
        params: params ?? undefined,
      }),
      providesTags: () => [tag("remote-sync-has-remote-changes")],
    }),
    updateRemoteSyncSettings: builder.mutation<
      UpdateRemoteSyncConfigurationResponse,
      RemoteSyncConfigurationSettings
    >({
      query: (settings) => ({
        method: "PUT",
        url: `/api/ee/remote-sync/settings`,
        body: settings,
      }),
      invalidatesTags: () => [
        tag("session-properties"),
        // Invalidate collection list to refresh is_remote_synced values
        listTag("collection"),
        // Invalidate library collection to refresh is_remote_synced value
        tag("library-collection"),
        // Invalidate dirty state to refetch after settings change
        tag("collection-dirty-entities"),
        tag("collection-is-dirty"),
      ],
    }),
    getBranches: builder.query<GetBranchesResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/branches`,
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
    createBranch: builder.mutation<void, CreateBranchRequest>({
      query: ({ name, checkout }) => ({
        method: "POST",
        url: `/api/ee/remote-sync/create-branch`,
        body: {
          name,
          checkout,
        },
      }),
      invalidatesTags: () => [
        tag("remote-sync-branches"),
        tag("session-properties"),
      ],
    }),
    getRemoteSyncCurrentTask: builder.query<
      RemoteSyncTask,
      { "worktree-id": WorktreeId } | void
    >({
      query: (params) => ({
        method: "GET",
        url: `/api/ee/remote-sync/current-task`,
        params: params ?? undefined,
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    /**
     * The same read as `getRemoteSyncCurrentTask`, for showing how the last sync ended. Kept as its
     * own endpoint because the remote-sync listener middleware treats every `getRemoteSyncCurrentTask`
     * result as progress of a task in flight (adopting it as the tracked task and, once it has ended,
     * invalidating the sync tags — which would refetch this query in a loop).
     */
    getRemoteSyncLastTask: builder.query<
      RemoteSyncTask | null,
      { "worktree-id": WorktreeId } | void
    >({
      query: (params) => ({
        method: "GET",
        url: `/api/ee/remote-sync/current-task`,
        params: params ?? undefined,
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    cancelRemoteSyncCurrentTask: builder.mutation<
      void,
      { worktree_id: WorktreeId } | void
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/remote-sync/current-task/cancel`,
        body: body ?? undefined,
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
    testRemoteSyncConnection: builder.mutation<
      TestRemoteSyncConnectionResponse,
      TestRemoteSyncConnectionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/remote-sync/test-connection`,
        body,
      }),
    }),
    listWorktrees: builder.query<Worktree[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/worktree`,
      }),
      providesTags: (worktrees = []) => provideWorktreeListTags(worktrees),
    }),
    getWorktree: builder.query<Worktree, WorktreeId>({
      query: (id) => ({
        method: "GET",
        url: `/api/ee/remote-sync/worktree/${id}`,
      }),
      providesTags: (worktree) =>
        worktree ? provideWorktreeTags(worktree) : [],
    }),
    createWorktree: builder.mutation<Worktree, CreateWorktreeRequest>({
      query: (body) => ({
        method: "POST",
        url: `/api/ee/remote-sync/worktree`,
        body,
      }),
      invalidatesTags: (_worktree, error) =>
        invalidateTags(error, [listTag("worktree")]),
    }),
    deleteWorktree: builder.mutation<void, WorktreeId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/remote-sync/worktree/${id}`,
      }),
      invalidatesTags: (_result, error, id) =>
        invalidateTags(error, [listTag("worktree"), idTag("worktree", id)]),
    }),
  }),
});

export const {
  useGetRemoteSyncChangesQuery,
  useLazyGetRemoteSyncChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useGetHasRemoteChangesQuery,
  useUpdateRemoteSyncSettingsMutation,
  useExportChangesMutation,
  useLazyGetExportPreflightQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useImportChangesMutation,
  useSwitchBranchMutation,
  useStashChangesMutation,
  useGetRemoteSyncCurrentTaskQuery,
  useGetRemoteSyncLastTaskQuery,
  useCancelRemoteSyncCurrentTaskMutation,
  useTestRemoteSyncConnectionMutation,
  useListWorktreesQuery,
  useGetWorktreeQuery,
  useCreateWorktreeMutation,
  useDeleteWorktreeMutation,
} = remoteSyncApi;
