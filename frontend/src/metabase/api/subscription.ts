import type {
  ChannelApiResponse,
  CreateSubscriptionRequest,
  DashboardSubscription,
  ListSubscriptionsRequest,
  TestSubscriptionRequest,
  UpdateSubscriptionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSubscriptionChannelListTags,
  provideSubscriptionListTags,
  provideSubscriptionTags,
} from "./tags";
import { pick } from "./utils/pick";

export const subscriptionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listSubscriptions: builder.query<
      DashboardSubscription[],
      ListSubscriptionsRequest
    >({
      query: (params) => ({
        method: "GET",
        url: "/api/pulse",
        params,
      }),
      providesTags: (subscriptions = []) =>
        provideSubscriptionListTags(subscriptions),
    }),
    getSubscription: builder.query<DashboardSubscription, number>({
      query: (id) => ({
        method: "GET",
        url: `/api/pulse/${id}`,
      }),
      providesTags: (subscription) =>
        subscription ? provideSubscriptionTags(subscription) : [],
    }),
    createSubscription: builder.mutation<
      DashboardSubscription,
      CreateSubscriptionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/pulse",
        body: pick(body, [
          "name",
          "cards",
          "channels",
          "skip_if_empty",
          "collection_id",
          "collection_position",
          "dashboard_id",
          "parameters",
        ]),
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [listTag("subscription")]),
    }),
    updateSubscription: builder.mutation<
      DashboardSubscription,
      UpdateSubscriptionRequest
    >({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/pulse/${id}`,
        body: pick(body, [
          "name",
          "cards",
          "channels",
          "skip_if_empty",
          "collection_id",
          "collection_position",
          "parameters",
          "archived",
        ]),
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("subscription"),
          idTag("subscription", id),
        ]),
    }),
    unsubscribe: builder.mutation<void, number>({
      query: (id) => ({
        method: "DELETE",
        url: `/api/pulse/${id}/subscription`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("subscription"),
          idTag("subscription", id),
        ]),
    }),
    testSubscription: builder.mutation<
      { ok: boolean },
      TestSubscriptionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/pulse/test",
        body: pick(body, [
          "id",
          "name",
          "cards",
          "channels",
          "skip_if_empty",
          "collection_id",
          "collection_position",
          "dashboard_id",
          "parameters",
        ]),
      }),
    }),
    getChannelInfo: builder.query<ChannelApiResponse, void>({
      query: () => ({
        method: "GET",
        url: `/api/pulse/form_input`,
      }),
      providesTags: () => provideSubscriptionChannelListTags(),
    }),
  }),
});

export const {
  useListSubscriptionsQuery,
  useGetSubscriptionQuery,
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useUnsubscribeMutation,
  useTestSubscriptionMutation,
  useGetChannelInfoQuery,
} = subscriptionApi;
