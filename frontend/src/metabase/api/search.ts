import type {
  SearchModelType,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "metabase-types/api";

import { Api } from "./api";
import type { TagType } from "./tags";
import { idTag, listTag } from "./tags";

const SEARCH_TAG_TYPES: Record<SearchModelType, TagType> = {
  action: "action",
  card: "card",
  collection: "collection",
  dashboard: "dashboard",
  database: "database",
  dataset: "card",
  "indexed-entity": "indexed-entity",
  metric: "metric",
  segment: "segment",
  snippet: "snippet",
  table: "table",
};

function searchItemListTags(items: SearchResult[], models?: SearchModelType[]) {
  return [
    ...(models
      ? models.map(type => listTag(SEARCH_TAG_TYPES[type]))
      : Object.values(SEARCH_TAG_TYPES).map(listTag)),
    ...items.map(item => idTag(SEARCH_TAG_TYPES[item.model], item.id)),
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
      providesTags: (response, error, { models }) =>
        searchItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
