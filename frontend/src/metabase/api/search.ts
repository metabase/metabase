import type {
  SearchModelType,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, MODEL_TO_TAG_TYPE } from "./tags";

function searchItemListTags(items: SearchResult[], types: SearchModelType[]) {
  return [
    ...types.map(type => listTag(MODEL_TO_TAG_TYPE[type])),
    ...items.map(item => idTag(MODEL_TO_TAG_TYPE[item.model], item.id)),
  ];
}

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: body => ({
        method: "GET",
        url: "/api/search",
        body,
      }),
      providesTags: (response, error, { models = [] }) =>
        searchItemListTags(
          response?.data ?? [],
          Array.isArray(models) ? models : [models],
        ),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
