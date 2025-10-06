import { EnterpriseApi } from "./api";

export const searchApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSemanticSearchStatus: builder.query<
      { indexed_count: number; total_est: number },
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/semantic-search/status",
      }),
    }),
  }),
});

export const { useGetSemanticSearchStatusQuery } = searchApi;
