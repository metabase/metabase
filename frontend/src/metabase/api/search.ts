import type { SearchRequest, SearchResponse } from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, MODEL_TO_TAG_TYPE } from "./tags";

export const searchApi = Api.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResponse, SearchRequest>({
      query: body => ({
        method: "GET",
        url: "/api/search",
        body,
      }),
      providesTags: (response, error, { models = [] }) => [
        ...(response?.data ?? []).map(item =>
          idTag(MODEL_TO_TAG_TYPE[item.model], item.id),
        ),
        ...(Array.isArray(models) ? models : [models]).map(model =>
          listTag(MODEL_TO_TAG_TYPE[model]),
        ),
      ],
    }),
  }),
});

export const { useSearchQuery } = searchApi;
