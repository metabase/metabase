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
        collection: CollectionId;
        forceSync?: boolean;
      }
    >({
      query: ({ message, collection, forceSync }) => ({
        url: `/api/ee/remote-sync/export`,
        method: "POST",
        body: {
          message,
          collection,
          "force-sync": forceSync,
        },
      }),
      invalidatesTags: (_, error, { collection }) =>
        invalidateTags(error, [
          tag("collection-dirty", collection),
          tag("collection-is-dirty", collection),
        ]),
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
  }),
});

export const {
  useGetCollectionDirtyEntitiesQuery,
  useIsCollectionDirtyQuery,
  useUpdateGitSyncSettingsMutation,
  useExportChangesMutation,
} = gitSyncApi;
