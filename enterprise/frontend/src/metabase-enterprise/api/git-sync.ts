import type { CollectionId, EnterpriseSettings } from "metabase-types/api";

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
  display?: string;
  query_type?: string;
  sync_status: "create" | "update" | "delete" | "touch";
  authority_level?: string | null;
};

export type CollectionDirtyResponse = {
  dirty: DirtyEntity[];
};

export type CollectionIsDirtyResponse = {
  is_dirty: boolean;
};

export type ExportChangesResponse = {
  success: boolean;
  message?: string;
  conflict?: boolean;
};

export type GitSyncSettings = Pick<
  EnterpriseSettings,
  | "remote-sync-enabled"
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
  | "remote-sync-configured"
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
          tag("collection-dirty"),
          tag("collection-is-dirty"),
        ]),
    }),
    importFromBranch: builder.mutation<void, { branch: string }>({
      query: ({ branch }) => ({
        url: `/api/ee/remote-sync/import`,
        method: "POST",
        body: {
          branch,
        },
      }),
      invalidatesTags: () => ["collection-tree"],
    }),
    getCollectionDirtyEntities: builder.query<
      CollectionDirtyResponse,
      { collectionId: CollectionId }
    >({
      query: ({ collectionId }) => ({
        url: `/api/ee/remote-sync/${collectionId}/dirty`,
        method: "GET",
      }),
      providesTags: (_, __, { collectionId }) => [
        tag("collection-dirty", collectionId),
      ],
    }),
    isCollectionDirty: builder.query<
      CollectionIsDirtyResponse,
      { collectionId: CollectionId }
    >({
      query: ({ collectionId }) => ({
        url: `/api/ee/remote-sync/${collectionId}/is-dirty`,
        method: "GET",
      }),
      providesTags: (_, __, { collectionId }) => [
        tag("collection-is-dirty", collectionId),
      ],
    }),
    updateGitSyncSettings: builder.mutation<void, GitSyncSettings>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/ee/remote-sync/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    getBranches: builder.query<{ items: string[] }, void>({
      query: () => ({
        method: "GET",
        url: `/api/ee/remote-sync/branches`,
      }),
      providesTags: () => [tag("remote-sync-branches")],
    }),
  }),
});

export const {
  useGetCollectionDirtyEntitiesQuery,
  useIsCollectionDirtyQuery,
  useUpdateGitSyncSettingsMutation,
  useExportChangesMutation,
  useGetBranchesQuery,
  useImportFromBranchMutation,
} = gitSyncApi;
