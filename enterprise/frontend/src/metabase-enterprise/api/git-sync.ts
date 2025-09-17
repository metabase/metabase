import type {
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


export type GitSyncSettings = Pick<
  EnterpriseSettings,
  | "remote-sync-url"
  | "remote-sync-token"
  | "remote-sync-type"
  | "remote-sync-branch"
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
        invalidateTags(error, request.collectionIds.map((id) => ({ type: "collection", id: `${id}-items` }))),
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
  useUpdateGitSyncSettingsMutation,
} = gitSyncApi;
