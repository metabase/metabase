import type {
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, MODEL_TO_TAG_TYPE } from "./tags";

function searchItemListTags(
  items: CollectionItem[],
  models: CollectionItemModel[],
) {
  return [
    ...models.map(type => listTag(MODEL_TO_TAG_TYPE[type])),
    ...items.map(item => idTag(MODEL_TO_TAG_TYPE[item.model], item.id)),
  ];
}

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
      providesTags: (response, error, { models = [] }) =>
        searchItemListTags(
          response?.data ?? [],
          Array.isArray(models) ? models : [models],
        ),
    }),
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
