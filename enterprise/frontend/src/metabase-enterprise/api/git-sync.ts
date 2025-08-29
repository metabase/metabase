import type {
  CreateBranchRequest,
  GitBranch,
  GitDiff,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags } from "./tags";

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
    listGitBranches: builder.query<GitBranch[], void>({
      query: () => ({
        url: `/api/ee/branch/`,
        method: "GET",
      }),
      transformResponse: (response: { data: GitBranch[] }) => response.data,
      providesTags: ["git-branch"],
    }),

    getGitBranch: builder.query<GitBranch, number>({
      query: (id) => ({
        url: `/api/ee/branch/${id}`,
        method: "GET",
      }),
      providesTags: (result, error, id) =>
        invalidateTags(error, [idTag("git-branch", id)]),
    }),

    createGitBranch: builder.mutation<GitBranch, CreateBranchRequest>({
      query: (body) => ({
        url: `/api/ee/branch/`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["git-branch"],
    }),

    deleteGitBranch: builder.mutation<void, number>({
      query: (id) => ({
        url: `/api/ee/branch/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["git-branch"],
    }),

    getGitDiff: builder.query<GitDiff[], { branchId: number }>({
      query: ({ branchId }) => ({
        url: `/api/ee/branch/${branchId}/diff`,
        method: "GET",
      }),
      transformResponse: (response: { data: GitDiff[] }) => response.data,
      providesTags: (result, error, { branchId }) =>
        invalidateTags(error, [idTag("git-diff", branchId)]),
    }),
  }),
});

export const {
  useImportGitMutation,
  useExportGitMutation,
  useListGitBranchesQuery,
  useGetGitBranchQuery,
  useCreateGitBranchMutation,
  useDeleteGitBranchMutation,
  useGetGitDiffQuery,
} = gitSyncApi;
