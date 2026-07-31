import type {
  Collection,
  CreateBranchRequest,
  CreateWorktreeCollectionRequest,
  CreateWorktreeRequest,
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
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
  StashChangesRequest,
  StashChangesResponse,
  TestRemoteSyncConnectionRequest,
  TestRemoteSyncConnectionResponse,
  UpdateRemoteSyncConfigurationResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, listTag, tag } from "./tags";

type WorktreeScope = {
  /** Scope the request to a worktree instead of the main app. */
  worktree_id?: RemoteSyncWorktreeId;
};

const worktreeParams = (worktreeId?: RemoteSyncWorktreeId) =>
  worktreeId != null ? { "worktree-id": worktreeId } : undefined;

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
      { branch: string } & WorktreeScope
    >({
      query: ({ branch, worktree_id }) => ({
        url: `/api/ee/remote-sync/export-preflight`,
        method: "GET",
        params: { branch, ...worktreeParams(worktree_id) },
      }),
      providesTags: () => [tag("remote-sync-has-remote-changes")],
    }),
    importChanges: builder.mutation<
      ImportFromBranchResponse,
      ImportFromBranchRequest
    >({
      query: ({ branch, force, merge, expected_branch, worktree_id }) => ({
        url: `/api/ee/remote-sync/import`,
        method: "POST",
        body: {
          branch,
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
    getRemoteSyncChanges: builder.query<
      RemoteSyncChangesResponse,
      WorktreeScope | void
    >({
      query: (args) => ({
        url: `/api/ee/remote-sync/dirty`,
        method: "GET",
        params: worktreeParams(args?.worktree_id),
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
      WorktreeScope | void
    >({
      query: (args) => ({
        url: `/api/ee/remote-sync/is-dirty`,
        method: "GET",
        params: worktreeParams(args?.worktree_id),
      }),
      providesTags: () => [tag("collection-is-dirty")],
    }),
    getHasRemoteChanges: builder.query<
      HasRemoteChangesResponse,
      WorktreeScope | void
    >({
      query: (args) => ({
        url: `/api/ee/remote-sync/has-remote-changes`,
        method: "GET",
        params: worktreeParams(args?.worktree_id),
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
        url: `/api/ee/remote-sync/branch`,
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
    createBranch: builder.mutation<void, CreateBranchRequest>({
      query: ({ name }) => ({
        method: "POST",
        url: `/api/ee/remote-sync/branch`,
        body: {
          name,
        },
      }),
      invalidatesTags: () => [tag("remote-sync-branches")],
    }),
    stashChanges: builder.mutation<StashChangesResponse, StashChangesRequest>({
      query: ({ new_branch, message }) => ({
        method: "POST",
        url: `/api/ee/remote-sync/stash`,
        body: {
          new_branch,
          message,
        },
      }),
      invalidatesTags: () => [
        tag("remote-sync-branches"),
        tag("session-properties"),
        tag("remote-sync-current-task"),
        tag("collection-dirty-entities"),
        tag("collection-is-dirty"),
      ],
    }),
    getRemoteSyncCurrentTask: builder.query<
      RemoteSyncTask,
      WorktreeScope | void
    >({
      query: (args) => ({
        method: "GET",
        url: `/api/ee/remote-sync/current-task`,
        params: worktreeParams(args?.worktree_id),
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    cancelRemoteSyncCurrentTask: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: `/api/ee/remote-sync/current-task/cancel`,
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
    listWorktrees: builder.query<RemoteSyncWorktree[], void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/worktree`,
      }),
      providesTags: (worktrees = []) => [
        listTag("remote-sync-worktree"),
        ...worktrees.map((worktree) =>
          idTag("remote-sync-worktree", worktree.id),
        ),
      ],
    }),
    createWorktree: builder.mutation<RemoteSyncWorktree, CreateWorktreeRequest>(
      {
        query: (body) => ({
          method: "POST",
          url: `/api/ee/remote-sync/worktree`,
          body,
        }),
        invalidatesTags: () => [listTag("remote-sync-worktree")],
      },
    ),
    createWorktreeCollection: builder.mutation<
      Collection,
      CreateWorktreeCollectionRequest
    >({
      query: ({ worktree_id, ...body }) => ({
        method: "POST",
        url: `/api/ee/remote-sync/worktree/${worktree_id}/collection`,
        body,
      }),
      invalidatesTags: () => [
        listTag("collection"),
        tag("collection-is-dirty"),
        tag("collection-dirty-entities"),
      ],
    }),
    deleteWorktree: builder.mutation<void, RemoteSyncWorktreeId>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/ee/remote-sync/worktree/${id}`,
      }),
      // Deleting a worktree removes every piece of content it checked out.
      invalidatesTags: () => [
        listTag("remote-sync-worktree"),
        listTag("collection"),
        listTag("transform"),
      ],
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
  useStashChangesMutation,
  useImportChangesMutation,
  useGetRemoteSyncCurrentTaskQuery,
  useCancelRemoteSyncCurrentTaskMutation,
  useTestRemoteSyncConnectionMutation,
  useListWorktreesQuery,
  useCreateWorktreeMutation,
  useCreateWorktreeCollectionMutation,
  useDeleteWorktreeMutation,
} = remoteSyncApi;
