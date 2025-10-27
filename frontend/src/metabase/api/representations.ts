import { Api } from "./api";

export const representationsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getExportSet: builder.query<
      { yamls: string[] },
      { type: string; id: number }
    >({
      query: ({ type, id }) => ({
        method: "GET",
        url: `/api/ee/representation/export-set/${type}/${id}`,
      }),
    }),
  }),
});

export const { useGetExportSetQuery } = representationsApi;
