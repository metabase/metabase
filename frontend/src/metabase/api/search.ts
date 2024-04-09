import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { searchItemListTags } from "./tags";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: body => ({
        method: "GET",
        url: "/api/search",
        body,
      }),
      providesTags: (response, error, { models }) =>
        searchItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
