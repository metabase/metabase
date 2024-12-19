import { EnterpriseApi } from "./api";

export const gsheetsApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    initiateOauth: builder.mutation<
      { oauth_url: string },
      { redirect_url: string }
    >({
      query: body => ({
        method: "POST",
        url: "/api/gsheets/oauth",
        body: body,
      }),
    }),

    getGsheetsOauthStatus: builder.query<{ oauth_setup: boolean }, void>({
      query: () => ({
        method: "GET",
        url: "/api/gsheets/oauth",
      }),
    }),

    saveGsheetsFolderLink: builder.mutation<
      { success: boolean },
      { url: string }
    >({
      query: body => ({
        method: "POST",
        url: "/api/gsheets/folder",
        body: body,
      }),
    }),
  }),
});

export const {
  useInitiateOauthMutation,
  useGetGsheetsOauthStatusQuery,
  useSaveGsheetsFolderLinkMutation,
} = gsheetsApi;
