import type { Transform } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { tag } from "./tags";

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

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    importGit: builder.mutation({
      query: () => ({
        method: "POST",
        url: "/api/ee/library/import",
      }),
      invalidatesTags: [tag("git-tree"), tag("git-file-content")],
    }),
    exportGit: builder.mutation({
      query: () => ({
        method: "POST",
        url: "/api/ee/library/export",
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
  }),
});

export const {
  useImportGitMutation,
  useExportGitMutation,
  useGetRepositoryTreeQuery,
  useGetFileContentQuery,
} = gitSyncApi;
