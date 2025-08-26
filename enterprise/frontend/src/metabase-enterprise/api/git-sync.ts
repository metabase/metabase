import type {
  CreateBranchRequest,
  GitBranch,
  Transform,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags } from "./tags";

const MOCK_BRANCHES: GitBranch[] = [
  {
    name: "main",
    sha: "abc123def456",
    protected: true,
    isDefault: true,
    lastCommit: {
      sha: "abc123def456",
      message: "Initial commit",
      author: "John Doe",
      date: "2024-01-15T10:30:00Z",
    },
  },
  {
    name: "sashas-analytics",
    sha: "789ghi012jkl",
    protected: false,
    isDefault: false,
    lastCommit: {
      sha: "789ghi012jkl",
      message: "Exploring",
      author: "Sasha",
      date: "2024-01-20T14:45:00Z",
    },
  },
  {
    name: "update-ecom-transforms",
    sha: "345mno678pqr",
    protected: false,
    isDefault: false,
    lastCommit: {
      sha: "345mno678pqr",
      message: "WIP: Update ecom transforms",
      author: "Bob Johnson",
      date: "2024-01-22T09:15:00Z",
    },
  },
  {
    name: "update-dev-transforms",
    sha: "901stu234vwx",
    protected: false,
    isDefault: false,
    lastCommit: {
      sha: "901stu234vwx",
      message: "WIP: Update dev transforms",
      author: "Alice Brown",
      date: "2024-01-23T16:20:00Z",
    },
  },
];

let mockBranches = [...MOCK_BRANCHES];

const MOCK_TRANSFORMS: Transform[] = [
  {
    id: 1,
    name: "customer_segments",
    description: "Customer segmentation based on purchase behavior",
    source: {
      type: "query",
      query: {
        "source-table": 1,
        filter: ["and", [">", ["field", 12, null], 100]],
        aggregation: [["count"]],
        breakout: [["field", 8, null]],
      },
    },
    target: {
      type: "table",
      name: "customer_segments",
      schema: "analytics",
    },
    created_at: "2024-01-15T10:30:00Z",
    updated_at: "2024-01-20T14:45:00Z",
    tag_ids: [1, 2],
  },
  {
    id: 2,
    name: "revenue_by_region",
    description: "Monthly revenue aggregated by region",
    source: {
      type: "query",
      query: {
        "source-table": 2,
        aggregation: [["sum", ["field", 15, null]]],
        breakout: [
          ["field", 8, { "temporal-unit": "month" }],
          ["field", 10, null],
        ],
      },
    },
    target: {
      type: "table",
      name: "revenue_by_region",
      schema: "reporting",
    },
    created_at: "2024-01-18T09:15:00Z",
    updated_at: "2024-01-23T16:20:00Z",
    tag_ids: [2, 3],
  },
  {
    id: 3,
    name: "product_performance",
    description: "Product performance metrics and KPIs",
    source: {
      type: "query",
      query: {
        "source-table": 3,
        aggregation: [
          ["sum", ["field", 20, null]],
          ["avg", ["field", 21, null]],
          ["count"],
        ],
        breakout: [["field", 18, null]],
        filter: [">=", ["field", 22, null], "2024-01-01"],
      },
    },
    target: {
      type: "table",
      name: "product_performance",
      schema: "analytics",
    },
    created_at: "2024-01-22T11:30:00Z",
    updated_at: "2024-01-24T08:45:00Z",
    tag_ids: [1, 3],
  },
];

export interface GitDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  content: Transform | null;
}

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    listGitBranches: builder.query<GitBranch[], void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { data: mockBranches };
      },
      providesTags: ["git-branch"],
    }),

    getGitBranch: builder.query<GitBranch, string>({
      queryFn: async (name) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const branch = mockBranches.find((b) => b.name === name);
        if (!branch) {
          return {
            error: {
              status: 404,
              statusText: "Not Found",
              data: { message: `Branch "${name}" not found` },
            },
          };
        }
        return { data: branch };
      },
      providesTags: (result, error, name) =>
        invalidateTags(error, [idTag("git-branch", name)]),
    }),

    createGitBranch: builder.mutation<GitBranch, CreateBranchRequest>({
      queryFn: async ({ name, sourceBranch }) => {
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (mockBranches.find((b) => b.name === name)) {
          return {
            error: {
              status: 400,
              statusText: "Bad Request",
              data: { message: `Branch "${name}" already exists` },
            },
          };
        }

        const source =
          mockBranches.find((b) => b.name === sourceBranch) ||
          mockBranches.find((b) => b.isDefault);

        if (!source) {
          return {
            error: {
              status: 404,
              statusText: "Not Found",
              data: { message: `Source branch "${sourceBranch}" not found` },
            },
          };
        }

        const newBranch: GitBranch = {
          name,
          sha: `new-${Date.now().toString(36)}`,
          protected: false,
          isDefault: false,
          lastCommit: {
            sha: source.lastCommit.sha,
            message: `Created branch ${name} from ${source.name}`,
            author: "Current User",
            date: new Date().toISOString(),
          },
        };

        mockBranches = [...mockBranches, newBranch];
        return { data: newBranch };
      },
      invalidatesTags: ["git-branch"],
    }),

    getGitDiff: builder.query<GitDiff[], { branch: string; base?: string }>({
      queryFn: async ({ branch, base = "main" }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (branch === base) {
          return { data: [] };
        }

        const mockDiffs: GitDiff[] = [];

        if (branch === "sashas-analytics") {
          mockDiffs.push({
            path: "customer_segments",
            status: "modified",
            content: MOCK_TRANSFORMS[0],
          });
          mockDiffs.push({
            path: "user_behavior",
            status: "added",
            content: {
              ...MOCK_TRANSFORMS[0],
              id: 4,
              name: "user_behavior",
              description: "User behavior analytics",
            },
          });
        } else if (branch === "update-ecom-transforms") {
          mockDiffs.push({
            path: "revenue_by_region",
            status: "modified",
            content: MOCK_TRANSFORMS[1],
          });
          mockDiffs.push({
            path: "product_performance",
            status: "modified",
            content: MOCK_TRANSFORMS[2],
          });
        } else {
          mockDiffs.push({
            path: "customer_segments",
            status: "modified",
            content: MOCK_TRANSFORMS[0],
          });
        }

        return { data: mockDiffs };
      },
      providesTags: (result, error, { branch }) =>
        invalidateTags(error, [idTag("git-diff", branch)]),
    }),
  }),
});

export const {
  useListGitBranchesQuery,
  useGetGitBranchQuery,
  useCreateGitBranchMutation,
  useGetGitDiffQuery,
} = gitSyncApi;
