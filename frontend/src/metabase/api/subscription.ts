import type {
  ListSubscriptionsRequest,
  DashboardSubscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
} from "metabase-types/api";

import { Api } from "./api";
import {
  idTag,
  invalidateTags,
  listTag,
  provideSubscriptionListTags,
  provideSubscriptionTags,
} from "./tags";

export const subscriptionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSubscriptions: builder.query<
      DashboardSubscription[],
      ListSubscriptionsRequest
    >({
      query: params => ({
        method: "GET",
        url: "/api/pulse",
        params,
      }),
      providesTags: (subscriptions = []) =>
        provideSubscriptionListTags(subscriptions),
    }),
    getSubscription: builder.query<DashboardSubscription, number>({
      query: id => ({
        method: "GET",
        url: `/api/pulse/${id}`,
      }),
      providesTags: subscription =>
        subscription ? provideSubscriptionTags(subscription) : [],
    }),
    createSubscription: builder.mutation<
      DashboardSubscription,
      CreateSubscriptionRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/pulse",
        body,
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
        body,
      }),
      invalidatesTags: (_, error, { id }) =>
        invalidateTags(error, [
          listTag("subscription"),
          idTag("subscription", id),
        ]),
    }),
    unsubscribe: builder.mutation<void, number>({
      query: id => ({
        method: "DELETE",
        url: `/api/pulse/${id}/subscription`,
      }),
      invalidatesTags: (_, error, id) =>
        invalidateTags(error, [
          listTag("subscription"),
          idTag("subscription", id),
        ]),
    }),
  }),
});

export const {
  useListSubscriptionsQuery,
  useGetSubscriptionQuery,
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useUnsubscribeMutation,
} = subscriptionApi;
