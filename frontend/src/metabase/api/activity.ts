import type {
  ActivityItemModel,
  PopularItem,
  RecentItem,
} from "metabase-types/api";

import { Api } from "./api";
import { idTag, listTag, MODEL_TO_TAG_TYPE } from "./tags";

const ACTIVITY_ITEM_MODELS: ActivityItemModel[] = [
  "table",
  "card",
  "dataset",
  "dashboard",
];

function activityItemListTags(items: PopularItem[]) {
  return [
    ...ACTIVITY_ITEM_MODELS.map(type => listTag(MODEL_TO_TAG_TYPE[type])),
    ...items.map(item =>
      idTag(MODEL_TO_TAG_TYPE[item.model], item.model_object.id),
    ),
  ];
}

export const activityApi = Api.injectEndpoints({
  endpoints: builder => ({
    listRecentItems: builder.query<RecentItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/recent_views",
      }),
      providesTags: (items = []) => activityItemListTags(items),
    }),
    listPopularItems: builder.query<PopularItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/popular_items",
      }),
      providesTags: (items = []) => activityItemListTags(items),
    }),
  }),
});

export const { useListRecentItemsQuery, useListPopularItemsQuery } =
  activityApi;
