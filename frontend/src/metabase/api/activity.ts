import type {
  RecentItem,
  CreateRecentRequest,
  RecentSelectionsResponse,
  PopularItem,
  RecentItemsResponse,
  PopularItemsResponse,
} from "metabase-types/api";

import { Api } from "./api";
import {
  provideActivityItemListTags,
  invalidateTags,
  idTag,
  TAG_TYPE_MAPPING,
} from "./tags";

export const activityApi = Api.injectEndpoints({
  endpoints: builder => ({
    listRecentViews: builder.query<RecentItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/recents?context=views",
      }),
      transformResponse: (response: RecentItemsResponse) =>
        response?.recent_views,
      providesTags: items => provideActivityItemListTags(items ?? []),
    }),
    listRecentSelections: builder.query<RecentItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/recents?context=selections",
      }),
      transformResponse: (response: RecentSelectionsResponse) =>
        response?.recent_selections,
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
    logRecentItem: builder.mutation<void, Omit<CreateRecentRequest, "context">>(
      {
        query: ({ model_id, model }) => ({
          method: "POST",
          url: "/api/activity/recents",
          body: {
            model_id,
            model,
            context: "selection",
          },
        }),
        invalidatesTags: (_, error, item) =>
          invalidateTags(error, [
            idTag(TAG_TYPE_MAPPING[item.model], item.model_id),
          ]),
      },
    ),
  }),
});

export const {
  useListRecentViewsQuery,
  useListRecentSelectionsQuery,
  useListPopularItemsQuery,
  useLogRecentItemMutation,
} = activityApi;
