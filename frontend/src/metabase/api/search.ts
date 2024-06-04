import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: ({ limit, offset, context, ...body }) => ({
        method: "GET",
        url: "/api/search",
        params: { limit, offset, context },
        body,
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
