import { listTag } from "metabase/api/tags";
import type {
  CardDisplayType,
  EnterpriseSettings,
  UserId,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, tag } from "./tags";

export type DirtyEntity = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  model:
    | "card"
    | "dataset"
    | "metric"
    | "dashboard"
    | "collection"
    | "document"
    | "snippet";
  collection_id?: number;
  display?: CardDisplayType;
  query_type?: string;
  sync_status: "create" | "update" | "delete" | "touch" | "removed";
  authority_level?: string | null;
};

export type CollectionDirtyResponse = {
  dirty: DirtyEntity[];
  changedCollections: Record<number, boolean>;
};

export type CollectionIsDirtyResponse = {
  is_dirty: boolean;
};

export type ExportChangesResponse = {
  success: boolean;
  message?: string;
  conflict?: boolean;
};

export type CurrentTaskStatus =
  | "running"
  | "successful"
  | "timed-out"
  | "cancelled"
  | "errored";

export type SyncTaskType = "import" | "export" | null;

export type CurrentTaskResponse = {
  id: number;
  sync_task_type: SyncTaskType;
  status: CurrentTaskStatus;
  progress: number | null; // float between 0 and 1
  started_at: string | null;
  ended_at: string | null;
  last_progress_report_at: string | null;
  error_message: string | null;
  initiated_by: UserId;
};

export type GitSyncSettingsSet = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
>;

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    exportChanges: builder.mutation<
      ExportChangesResponse,
      {
        message?: string;
        branch?: string;
        forceSync?: boolean;
      }
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
      void,
      { branch: string; force?: boolean }
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
    updateGitSyncSettings: builder.mutation<void, GitSyncSettingsSet>({
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
    getBranches: builder.query<{ items: string[] }, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/branches`,
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
    createBranch: builder.mutation<void, { name: string; baseBranch?: string }>(
      {
        query: ({ name, baseBranch }) => ({
          method: "POST",
          url: `/api/ee/remote-sync/branches`,
          body: {
            name,
            base_branch: baseBranch || "main",
          },
        }),
        invalidatesTags: () => [tag("remote-sync-branches")],
      },
    ),
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
  useUpdateGitSyncSettingsMutation,
  useExportChangesMutation,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useImportFromBranchMutation,
  useGetCurrentSyncTaskQuery,
  useCancelSyncTaskMutation,
} = gitSyncApi;
