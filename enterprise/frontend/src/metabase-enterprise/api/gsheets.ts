import { EnterpriseApi } from "./api";

export const gsheetsApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
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
  }),
});

export const { useSaveGsheetsFolderLinkMutation } = gsheetsApi;
