import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { registerSearchStarted, trackFulfilledSearch } from "./analytics";
import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const searchApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/search",
        params,
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
      onQueryStarted: (args, { queryFulfilled, requestId }) => {
        registerSearchStarted(args, requestId);
        const start = Date.now();
        return handleQueryFulfilled(queryFulfilled, (data) =>
          trackFulfilledSearch(args, data, Date.now() - start, requestId),
        );
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
