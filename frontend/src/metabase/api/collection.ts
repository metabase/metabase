import type {
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, MODEL_TO_TAG_TYPE } from "./tags";

export const collectionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listCollectionItems: builder.query<
      ListCollectionItemsResponse,
      ListCollectionItemsRequest
    >({
      query: ({ id, ...body }) => ({
        method: "GET",
        url: `/api/collection/${id}/items`,
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

export const { useListCollectionItemsQuery } = collectionApi;
