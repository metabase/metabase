import { EnterpriseApi } from "./api";

export const searchApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSemanticSearchStatus: builder.query<
      { indexed_count?: number; total_est?: number },
      void
    >({
      query: () => ({
        method: "GET",
        url: "/api/ee/semantic-search/status",
      }),
    }),
    reInitSemanticSearch: builder.mutation<{ message?: unknown }, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/semantic-search/re-init",
      }),
    }),
  }),
});

export const {
  useGetSemanticSearchStatusQuery,
  useReInitSemanticSearchMutation,
} = searchApi;
