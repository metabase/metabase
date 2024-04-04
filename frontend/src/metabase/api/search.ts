import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: body => ({
        method: "GET",
        url: "/api/search",
        body,
      }),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
