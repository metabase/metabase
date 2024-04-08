import type {
  CollectionItem,
  CollectionItemModel,
  ListCollectionItemsRequest,
  ListCollectionItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import type { TagType } from "./tags";
import { idTag, listTag } from "./tags";

const COLLECTION_TAG_TYPES: Record<CollectionItemModel, TagType> = {
  card: "card",
  dataset: "card",
  dashboard: "dashboard",
  snippet: "snippet",
  collection: "collection",
  "indexed-entity": "indexed-entity",
};

function collectionItemListTags(
  items: CollectionItem[],
  models?: CollectionItemModel[],
) {
  return [
    ...(models
      ? models.map(type => listTag(COLLECTION_TAG_TYPES[type]))
      : Object.values(COLLECTION_TAG_TYPES).map(listTag)),
    ...items.map(item => idTag(COLLECTION_TAG_TYPES[item.model], item.id)),
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
      providesTags: (response, error, { models }) =>
        collectionItemListTags(response?.data ?? [], models),
    }),
  }),
});

export const { useListCollectionItemsQuery } = collectionApi;
