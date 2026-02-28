import type {
  CreateRecentRequest,
  Field,
  PopularItem,
  PopularItemsResponse,
  RecentItem,
  RecentsRequest,
  RecentsResponse,
  VisualizationDisplay,
} from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, listTag, provideActivityItemListTags } from "./tags";

export const activityApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listRecents: builder.query<RecentItem[], RecentsRequest | void>({
      query: ({ context, include_metadata } = {}) => {
        const contextParams = [];

        if (context) {
          // concat() because sorting mutates the array
          // and we don't want to mutate the original context array
          context
            .concat()
            .sort()
            .forEach((ctx) => {
              contextParams.push(`context=${ctx}`);
            });
        } else {
          contextParams.push("context=views");
        }

        if (include_metadata != null) {
          contextParams.push(`include_metadata=${include_metadata}`);
        }

        return {
          method: "GET",
          url: `/api/activity/recents?${contextParams.join("&")}`,
        };
      },
      transformResponse: (response: RecentsResponse) => response?.recents,
      providesTags: (items) => provideActivityItemListTags(items ?? []),
    }),
    listPopularItems: builder.query<PopularItem[], void>({
      query: () => ({
        method: "GET",
        url: "/api/activity/popular_items",
      }),
      transformResponse: (response: PopularItemsResponse) =>
        response?.popular_items,
      providesTags: (items) => provideActivityItemListTags(items ?? []),
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
        invalidatesTags: (_, error) =>
          invalidateTags(error, [listTag("activity-item")]),
      },
    ),
  }),
});

export const { useListPopularItemsQuery, useLogRecentItemMutation } =
  activityApi;

type GetRecentsQueryOptions = Parameters<
  typeof activityApi.useListRecentsQuery
>[1];

// Makes it possible and type-safe to use the `include_metadata` parameter
// in the `useListRecentsQuery` hook. If `include_metadata` is set to `true`,
// the returned data will include the `result_metadata` property
type RecentItemWithMetadata = RecentItem & {
  result_metadata: Field[];
  display: VisualizationDisplay;
};
export function useListRecentsQuery<T extends boolean | undefined = undefined>(
  params?:
    | ({ include_metadata?: T } & Omit<RecentsRequest, "include_metadata">)
    | void,
  options?: GetRecentsQueryOptions,
) {
  type ResultType = T extends true ? RecentItemWithMetadata : RecentItem;
  return activityApi.endpoints.listRecents.useQuery(
    params,
    options,
  ) as ReturnType<typeof activityApi.endpoints.listRecents.useQuery> & {
    data?: ResultType[];
  };
}
