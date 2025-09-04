import type { Transform } from "metabase-types/api";

import { EnterpriseApi } from "./api";

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
      transformResponse: (response: GitFileContent) => {
        // Mock transform entity for all files for now
        const mockTransform: Transform = {
          id: 1,
          name: `Transform from ${response.path}`,
          description: "Mock transform entity for demonstration",
          source: {
            type: "query",
            query: {
              database: 1,
              type: "native",
              native: {
                query: "SELECT * FROM orders LIMIT 10",
              },
            },
          },
          target: {
            type: "table",
            name: "transformed_data",
            schema: null,
          },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        };

        return {
          ...response,
          entityType: "transform" as EntityType,
          entity: mockTransform,
        };
      },
    }),
  }),
});

export const {
  useImportGitMutation,
  useExportGitMutation,
  useGetRepositoryTreeQuery,
  useGetFileContentQuery,
} = gitSyncApi;
