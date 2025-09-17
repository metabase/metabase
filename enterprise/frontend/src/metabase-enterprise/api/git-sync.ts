import type {
  Collection,
  CollectionId,
  EnterpriseSettings,
  Transform,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, tag } from "./tags";

export type GitTreeNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: GitTreeNode[];
};

export type EntityType = "transform";

export type GitFileContent = {
  path: string;
  content: string;
  entityType?: EntityType;
  entity?: Transform;
};

export type UnsyncedEntity = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  model:
    | "collection"
    | "card"
    | "dashboard"
    | "snippet"
    | "timeline"
    | "document";
  collection_id?: number;
  authority_level?: "official" | null;
  display?: string;
  query_type?: string;
};

export type UnsyncedChangesResponse = {
  has_unsynced_changes: boolean;
  last_sync_at: string | null;
  unsynced_counts?: {
    collections: number;
    cards: number;
    dashboards: number;
    snippets: number;
    timelines: number;
    documents: number;
    total: number;
  };
  entities?: UnsyncedEntity[];
  message?: string;
};

export type SyncedCollectionsResponse = {
  collections: Collection[];
};

export type GitSyncSettings = Pick<
  EnterpriseSettings,
  | "git-sync-enabled"
  | "git-sync-url"
  | "git-sync-token"
  | "git-sync-type"
  | "git-sync-import-branch"
  | "git-sync-export-branch"
>;

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    importGit: builder.mutation<
      void,
      { branch: string; collectionIds: CollectionId[] }
    >({
      query: ({ branch }) => ({
        method: "POST",
        url: "/api/ee/library/import",
        body: { branch },
      }),
      invalidatesTags: (response, error, request) =>
        request.collectionIds.map((id) => `collection-${id}-items`),
    }),
    exportGit: builder.mutation<void, { branch: string }>({
      query: ({ branch }) => ({
        method: "POST",
        url: "/api/ee/library/export",
        body: { branch },
      }),
    }),
    getRepositoryTree: builder.query<GitTreeNode, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/library/source",
      }),
      providesTags: [tag("git-tree")],
    }),
    getFileContent: builder.query<GitFileContent, string>({
      query: (path) => ({
        method: "GET",
        url: `/api/ee/library/source/${encodeURIComponent(path)}`,
      }),
      providesTags: [tag("git-file-content")],
    }),
    getUnsyncedChanges: builder.query<UnsyncedChangesResponse, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/library/unsynced-changes",
      }),
    }),
    getSyncedCollections: builder.query<SyncedCollectionsResponse, void>({
      queryFn: async () => {
        try {
          // Mock implementation using localStorage
          const stored = localStorage.getItem("mock_synced_collections");
          const collections = stored ? JSON.parse(stored) : [];
          return { data: { collections } };
        } catch (error) {
          return {
            error: { status: 500, data: "Failed to fetch synced collections" },
          };
        }
      },
      providesTags: [tag("synced-collections")],
    }),
    addSyncedCollection: builder.mutation<
      Collection,
      { collectionId: CollectionId; collection?: Collection }
    >({
      queryFn: async ({ collectionId, collection }) => {
        try {
          // Mock implementation using localStorage
          const stored = localStorage.getItem("mock_synced_collections");
          const collections: Collection[] = stored ? JSON.parse(stored) : [];

          // Check if already exists
          if (collections.some((c) => c.id === collectionId)) {
            return {
              error: { status: 409, data: "Collection already synced" },
            };
          }

          // Create a mock synced collection
          const newCollection: Collection = collection
            ? {
                ...collection,
                git_sync_enabled: true,
              }
            : ({
                id: collectionId,
                name: `Collection ${collectionId}`,
                description: null,
                can_write: true,
                can_restore: false,
                can_delete: true,
                archived: false,
                git_sync_enabled: true,
              } as Collection);

          collections.push(newCollection);
          localStorage.setItem(
            "mock_synced_collections",
            JSON.stringify(collections),
          );

          return { data: newCollection };
        } catch (error) {
          return {
            error: { status: 500, data: "Failed to add synced collection" },
          };
        }
      },
      invalidatesTags: [tag("synced-collections")],
    }),
    removeSyncedCollection: builder.mutation<
      void,
      { collectionId: CollectionId }
    >({
      queryFn: async ({ collectionId }) => {
        try {
          // Mock implementation using localStorage
          const stored = localStorage.getItem("mock_synced_collections");
          const collections: Collection[] = stored ? JSON.parse(stored) : [];

          const filteredCollections = collections.filter(
            (c) => c.id !== collectionId,
          );
          localStorage.setItem(
            "mock_synced_collections",
            JSON.stringify(filteredCollections),
          );

          return { data: undefined };
        } catch (error) {
          return {
            error: { status: 500, data: "Failed to remove synced collection" },
          };
        }
      },
      invalidatesTags: [tag("synced-collections")],
    }),
    updateGitSyncSettings: builder.mutation<void, GitSyncSettings>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/ee/library/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useImportGitMutation,
  useExportGitMutation,
  useGetRepositoryTreeQuery,
  useGetFileContentQuery,
  useGetUnsyncedChangesQuery,
  useGetSyncedCollectionsQuery,
  useAddSyncedCollectionMutation,
  useRemoveSyncedCollectionMutation,
  useUpdateGitSyncSettingsMutation,
} = gitSyncApi;
