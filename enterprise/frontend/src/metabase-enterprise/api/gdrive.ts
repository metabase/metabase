import type { DatabaseId, Settings } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const gdriveApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getServiceAccount: builder.query<{ email: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/gsheets/service-account",
      }),
    }),
    getGsheetsFolder: builder.query<
      Settings["gsheets"] & { db_id: DatabaseId },
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/gsheets/folder",
      }),
      providesTags: ["gsheets-status"],
    }),
    saveGsheetsFolderLink: builder.mutation<
      { success: boolean },
      { url: string; link_type?: "folder" | "file" }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/gsheets/folder",
        body: body,
      }),
      invalidatesTags: ["gsheets-status"],
    }),
    deleteGsheetsFolderLink: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/gsheets/folder",
      }),
      invalidatesTags: ["gsheets-status"],
    }),
    syncGsheetsFolder: builder.mutation<{ db_id: DatabaseId }, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/gsheets/folder/sync",
      }),
      invalidatesTags: ["gsheets-status"],
    }),
  }),
});

export const {
  useGetServiceAccountQuery,
  useGetGsheetsFolderQuery,
  useDeleteGsheetsFolderLinkMutation,
  useSaveGsheetsFolderLinkMutation,
  useSyncGsheetsFolderMutation,
} = gdriveApi;
