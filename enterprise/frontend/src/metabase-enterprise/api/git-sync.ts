import type {
  CreateBranchRequest,
  GitBranch,
  GitDiff,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { idTag, invalidateTags } from "./tags";

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
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

    getGitDiff: builder.query<GitDiff[], { branch: string; base?: string }>({
      queryFn: async () => {
        // TODO: Replace with real API call when backend endpoint is available
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { data: [] };
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
  useDeleteGitBranchMutation,
  useGetGitDiffQuery,
} = gitSyncApi;
