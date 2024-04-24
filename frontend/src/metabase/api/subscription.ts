import { Api } from "./api";

export const subscriptionApi = Api.injectEndpoints({
  endpoints: builder => ({
    listSubscriptions: builder.query<unknown, unknown>({
      query: () => ({
        method: "GET",
        url: "/api/pulse",
      }),
    }),
    getSubscription: builder.query<unknown, number>({
      query: id => ({
        method: "GET",
        url: `/api/pulse/${id}`,
      }),
    }),
    createSubscription: builder.mutation<unknown, unknown>({
      query: body => ({
        method: "POST",
        url: "/api/pulse",
        body,
      }),
    }),
    updateSubscription: builder.mutation<unknown, unknown>({
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
