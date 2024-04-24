import type {
  ListSubscriptionsRequest,
  DashboardSubscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
} from "metabase-types/api";

import { Api } from "./api";

export const subscriptionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSubscriptions: builder.query<
      DashboardSubscription[],
      ListSubscriptionsRequest
    >({
      query: parameters => ({
        method: "GET",
        url: "/api/pulse",
        parameters,
      }),
    }),
    getSubscription: builder.query<DashboardSubscription, number>({
      query: id => ({
        method: "GET",
        url: `/api/pulse/${id}`,
      }),
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
    }),
    unsubscribe: builder.mutation<unknown, number>({
      query: id => ({
        method: "DELETE",
        url: `/api/pulse/${id}/subscription`,
      }),
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
