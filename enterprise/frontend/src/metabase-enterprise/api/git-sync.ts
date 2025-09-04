import { EnterpriseApi } from "./api";

export type GitTreeNode = {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: GitTreeNode[];
};

export type GitFileContent = {
  path: string;
  content: string;
};

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    importGit: builder.mutation({
      query: () => ({
        method: "POST",
        url: "/api/ee/git-source-of-truth/import",
      }),
    }),
    exportGit: builder.mutation({
      query: () => ({
        method: "POST",
        url: "/api/ee/git-source-of-truth/export",
      }),
    }),
    getRepositoryTree: builder.query<GitTreeNode, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/git-source-of-truth/git",
      }),
    }),
    getFileContent: builder.query<GitFileContent, string>({
      query: (path) => ({
        method: "GET",
        url: `/api/ee/git-source-of-truth/git/${encodeURIComponent(path)}`,
      }),
    }),
  }),
});

export const {
  useImportGitMutation,
  useExportGitMutation,
  useGetRepositoryTreeQuery,
  useGetFileContentQuery,
} = gitSyncApi;
