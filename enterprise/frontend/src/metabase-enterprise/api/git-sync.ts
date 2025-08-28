import { EnterpriseApi } from "./api";

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
  }),
});

export const { useImportGitMutation, useExportGitMutation } = gitSyncApi;
