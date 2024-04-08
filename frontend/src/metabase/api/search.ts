import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { MODEL_TYPES, searchItemListTags } from "./tags";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: body => ({
        method: "GET",
        url: "/api/search",
        body,
      }),
      providesTags: (response, error, { models = Array.from(MODEL_TYPES) }) =>
        searchItemListTags(
          response?.data ?? [],
          Array.isArray(models) ? models : [models],
        ),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
