import type {
  RecentItem,
  PopularItem,
  RecentItemsResponse,
  PopularItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import { provideActivityItemListTags } from "./tags";

export const activityApi = Api.injectEndpoints({
  endpoints: builder => ({
    listRecentItems: builder.query<RecentItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/recent_views",
      }),
      transformResponse: (response: RecentItemsResponse) =>
        response?.recent_views,
      providesTags: items => provideActivityItemListTags(items ?? []),
    }),
    listPopularItems: builder.query<PopularItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/popular_items",
      }),
      transformResponse: (response: PopularItemsResponse) =>
        response?.popular_items,
      providesTags: items => provideActivityItemListTags(items ?? []),
    }),
  }),
});

export const { useListRecentItemsQuery, useListPopularItemsQuery } =
  activityApi;
