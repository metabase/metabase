import { EnterpriseApi } from "./api";

export const gitSyncApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    reloadGit: builder.mutation({
      query: () => ({
        method: "POST",
        url: "/api/ee/git-source-of-truth/reload",
      }),
    }),
  }),
});

export const { useReloadGitMutation } = gitSyncApi;
