import { EnterpriseApi } from "./api";

export const gsheetsApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getGsheetsOauthLink: builder.query<{ oauth_url: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/gsheets/oauth",
      }),
    }),
    saveGsheetsFolderLink: builder.mutation<
      { success: boolean },
      { url: string }
    >({
      query: () => ({
        method: "POST",
        url: "/api/gsheets/folder",
      }),
    }),
  }),
});

export const { useGetGsheetsOauthLinkQuery, useSaveGsheetsFolderLinkMutation } =
  gsheetsApi;
