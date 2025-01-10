import { EnterpriseApi } from "./api";

export const gsheetsApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getServiceAccount: builder.query<{ email: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/gsheets/service-account",
      }),
    }),
    saveGsheetsFolderLink: builder.mutation<
      { success: boolean },
      { url: string }
    >({
      query: body => ({
        method: "POST",
        url: "/api/ee/gsheets/folder",
        body: body,
      }),
    }),
    deleteGsheetsFolderLink: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/ee/gsheets/folder",
      }),
    }),
  }),
});

export const {
  useGetServiceAccountQuery,
  useDeleteGsheetsFolderLinkMutation,
  useSaveGsheetsFolderLinkMutation,
} = gsheetsApi;
