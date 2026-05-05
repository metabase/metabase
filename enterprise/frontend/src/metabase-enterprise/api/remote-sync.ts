import type {
  CreateBranchRequest,
  ExportChangesRequest,
  ExportChangesResponse,
  GetBranchesResponse,
  HasRemoteChangesResponse,
  ImportFromBranchRequest,
  ImportFromBranchResponse,
  RemoteSyncChangesResponse,
  RemoteSyncConfigurationSettings,
  RemoteSyncHasChangesResponse,
  RemoteSyncTask,
  UpdateRemoteSyncConfigurationResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag, tag } from "./tags";

export const remoteSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    exportChanges: builder.mutation<
      ExportChangesResponse,
      ExportChangesRequest
    >({
      query: ({ message, force, branch }) => ({
        url: `/api/ee/remote-sync/export`,
        method: "POST",
        body: {
          message,
          branch,
          force,
        },
      }),
      invalidatesTags: () => [
        tag("collection-dirty-entities"),
        tag("session-properties"),
      ],
    }),
    importChanges: builder.mutation<
      ImportFromBranchResponse,
      ImportFromBranchRequest
    >({
      query: ({ branch, force }) => ({
        url: `/api/ee/remote-sync/import`,
        method: "POST",
        body: {
          branch,
          force,
        },
      }),
      /**
       * Tags invalidation for import happens in the middleware after the import task is successful.
       * @see remote-sync-middleware.ts
       */
    }),
    getRemoteSyncChanges: builder.query<RemoteSyncChangesResponse, void>({
      query: () => ({
        url: `/api/ee/remote-sync/dirty`,
        method: "GET",
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
    getRemoteSyncHasChanges: builder.query<RemoteSyncHasChangesResponse, void>({
      query: () => ({
        url: `/api/ee/remote-sync/is-dirty`,
        method: "GET",
      }),
      providesTags: () => [tag("collection-is-dirty")],
    }),
    getHasRemoteChanges: builder.query<HasRemoteChangesResponse, void>({
      query: () => ({
        url: `/api/ee/remote-sync/has-remote-changes`,
        method: "GET",
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
      query: ({ name }) => ({
        method: "POST",
        url: `/api/ee/remote-sync/create-branch`,
        body: {
          name,
        },
      }),
      invalidatesTags: () => [
        tag("remote-sync-branches"),
        tag("session-properties"),
      ],
    }),
    getRemoteSyncCurrentTask: builder.query<RemoteSyncTask, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/current-task`,
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
  }),
});

export const {
  useGetRemoteSyncChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useGetHasRemoteChangesQuery,
  useUpdateRemoteSyncSettingsMutation,
  useExportChangesMutation,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useImportChangesMutation,
  useGetRemoteSyncCurrentTaskQuery,
  useCancelRemoteSyncCurrentTaskMutation,
} = remoteSyncApi;
