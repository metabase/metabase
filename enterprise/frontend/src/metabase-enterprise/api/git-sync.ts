import { EnterpriseApi } from "./api";

export type GitTreeNode = {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  children?: GitTreeNode[];
};

export type GitFileContent = {
  path: string;
  content: string;
  type: "markdown" | "transform";
};

const mockRepositoryTree: GitTreeNode = {
  id: "root",
  name: "metabase-library",
  path: "/",
  type: "folder",
  children: [
    {
      id: "readme",
      name: "README.md",
      path: "/README.md",
      type: "file",
    },
    {
      id: "entities",
      name: "entities",
      path: "/entities",
      type: "folder",
      children: [
        {
          id: "transforms",
          name: "transforms",
          path: "/entities/transforms",
          type: "folder",
          children: [
            {
              id: "sql-transform",
              name: "customer_metrics.toml",
              path: "/entities/transforms/customer_metrics.toml",
              type: "file",
            },
            {
              id: "mbql-transform",
              name: "revenue_analysis.toml",
              path: "/entities/transforms/revenue_analysis.toml",
              type: "file",
            },
          ],
        },
      ],
    },
  ],
};

const mockFileContents: Record<string, GitFileContent> = {
  "/README.md": {
    path: "/README.md",
    // eslint-disable-next-line no-literal-metabase-strings -- mock data
    content: `# Metabase Library

Welcome to your Metabase library repository. This repository contains all your transforms, dashboards, and other Metabase entities.

## Structure

- \`/entities\` - Contains all Metabase entities
  - \`/entities/transforms\` - Transform definitions

## Getting Started

1. Configure Git sync in Metabase settings
2. Push your changes to keep your library in sync
3. Pull changes to get updates from your team`,
    type: "markdown",
  },
  "/entities/transforms/customer_metrics.toml": {
    path: "/entities/transforms/customer_metrics.toml",
    content: `[transform]
name = "Customer Metrics"
description = "Calculate key customer metrics"
target_type = "table"
target_schema = "analytics"
target_name = "customer_metrics"

[source]
type = "query"

[source.query]
type = "native"
database = 1

[source.query.native]
query = """
SELECT
  customer_id,
  COUNT(DISTINCT order_id) as total_orders,
  SUM(total_amount) as lifetime_value,
  MAX(order_date) as last_order_date,
  DATEDIFF('day', MIN(order_date), MAX(order_date)) as customer_tenure_days
FROM orders
GROUP BY customer_id
"""`,
    type: "transform",
  },
  "/entities/transforms/revenue_analysis.toml": {
    path: "/entities/transforms/revenue_analysis.toml",
    content: `[transform]
name = "Revenue Analysis"
description = "Monthly revenue breakdown by product category"
target_type = "table"
target_schema = "analytics"
target_name = "monthly_revenue"

[source]
type = "query"

[source.query]
type = "query"
database = 1

[source.query.query]
source_table = 2
aggregation = [["sum", ["field", 12, null]]]
breakout = [
  ["field", 15, {"temporal-unit": "month"}],
  ["field", 18, null]
]
filter = [">=", ["field", 15, null], "2024-01-01"]`,
    type: "transform",
  },
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
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { data: mockRepositoryTree };
      },
    }),
    getFileContent: builder.query<GitFileContent, string>({
      queryFn: async (path) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const content = mockFileContents[path];
        if (!content) {
          return { error: { status: 404, data: "File not found" } };
        }
        return { data: content };
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
