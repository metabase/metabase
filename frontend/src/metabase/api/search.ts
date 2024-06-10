import { trackSearchRequest } from "metabase/search/analytics";
import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { provideSearchItemListTags } from "./tags";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: params => ({
        method: "GET",
        url: "/api/search",
        params,
      }),
      providesTags: (response, error, { models }) =>
        provideSearchItemListTags(response?.data ?? [], models),
      onQueryStarted: (args, { queryFulfilled }) => {
        if (args.context) {
          const start = Date.now();
          queryFulfilled.then(({ data }) => {
            const duration = Date.now() - start;
            trackSearchRequest(args, data, duration);
          });
        }
      },
    }),
  }),
});

export const { useSearchQuery } = searchApi;
