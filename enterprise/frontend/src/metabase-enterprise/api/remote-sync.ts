import { listTag } from "metabase/api/tags";
import type {
  CollectionDirtyResponse,
  CollectionIsDirtyResponse,
  CreateBranchRequest,
  CurrentTaskResponse,
  ExportChangesRequest,
  ExportChangesResponse,
  GetBranchesResponse,
  ImportFromBranchRequest,
  ImportFromBranchResponse,
  RemoteSyncSettingsSet,
  UpdateRemoteSyncSettingsResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, tag } from "./tags";

export const remoteSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    exportChanges: builder.mutation<
      ExportChangesResponse,
      ExportChangesRequest
    >({
      query: ({ message, forceSync, branch }) => ({
        url: `/api/ee/remote-sync/export`,
        method: "POST",
        body: {
          message,
          branch,
          "force-sync": forceSync,
        },
      }),

      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("collection-dirty-entities"),
          tag("collection-is-dirty"),
          tag("remote-sync-current-task"),
          listTag("collection"),
          tag("collection-tree"),
        ]),
    }),
    importFromBranch: builder.mutation<
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
      invalidatesTags: () => [
        tag("session-properties"),
        listTag("collection"),
        tag("collection-tree"),
        tag("remote-sync-current-task"),
        tag("collection-dirty-entities"),
        tag("collection-is-dirty"),
      ],
    }),
    getChangedEntities: builder.query<CollectionDirtyResponse, void>({
      query: () => ({
        url: `/api/ee/remote-sync/dirty`,
        method: "GET",
      }),
      providesTags: () => [tag("collection-dirty-entities")],
      transformResponse: (response: CollectionDirtyResponse) => {
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
    hasChangedEntities: builder.query<CollectionIsDirtyResponse, void>({
      query: () => ({
        url: `/api/ee/remote-sync/is-dirty`,
        method: "GET",
      }),
      providesTags: () => [tag("collection-is-dirty")],
    }),
    updateRemoteSyncSettings: builder.mutation<
      UpdateRemoteSyncSettingsResponse,
      RemoteSyncSettingsSet
    >({
      query: (settings) => ({
        method: "PUT",
        url: `/api/ee/remote-sync/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("session-properties"),
          tag("remote-sync-current-task"),
          listTag("collection"),
          tag("collection-tree"),
        ]),
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
      invalidatesTags: () => [tag("remote-sync-branches")],
    }),
    getCurrentSyncTask: builder.query<CurrentTaskResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/current-task`,
      }),
      providesTags: () => [tag("remote-sync-current-task")],
    }),
    cancelSyncTask: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: `/api/ee/remote-sync/current-task/cancel`,
      }),
      invalidatesTags: () => [tag("remote-sync-current-task")],
    }),
  }),
});

export const {
  useGetChangedEntitiesQuery,
  useHasChangedEntitiesQuery,
  useUpdateRemoteSyncSettingsMutation,
  useExportChangesMutation,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useImportFromBranchMutation,
  useGetCurrentSyncTaskQuery,
  useCancelSyncTaskMutation,
} = remoteSyncApi;
