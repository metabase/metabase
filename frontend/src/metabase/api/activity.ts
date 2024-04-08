import type {
  ActivityModel,
  PopularItem,
  RecentItem,
} from "metabase-types/api";

import { Api } from "./api";
import type { TagType } from "./tags";
import { idTag, listTag } from "./tags";

const ACTIVITY_TAG_TYPES: Record<ActivityModel, TagType> = {
  table: "table",
  card: "card",
  dataset: "card",
  dashboard: "dashboard",
};

function activityItemListTags(items: PopularItem[]) {
  return [
    ...Object.values(ACTIVITY_TAG_TYPES).map(listTag),
    ...items.map(item =>
      idTag(ACTIVITY_TAG_TYPES[item.model], item.model_object.id),
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
