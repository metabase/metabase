import type {
  RecentItem,
  CreateRecentRequest,
  RecentsResponse,
  PopularItem,
  PopularItemsResponse,
  RecentsRequest,
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
    listRecents: builder.query<RecentItem[], RecentsRequest | void>({
      query: ({ context } = { context: ["views"] }) => {
        const contextParam = [...context]
          .sort()
          .map(ctx => `context=${ctx}`)
          .join("&");

        return {
          method: "GET",
          url: `/api/activity/recents?${contextParam}`,
        };
      },
      transformResponse: (response: RecentsResponse) => response?.recents,
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
  useListRecentsQuery,
  useListPopularItemsQuery,
  useLogRecentItemMutation,
} = activityApi;
