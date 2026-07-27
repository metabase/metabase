import type { ProductNotification } from "metabase-types/api";

import { Api } from "./api";

export const productNotificationApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    listProductNotifications: builder.query<ProductNotification[], void>({
      query: () => ({
        method: "GET",
        url: "/api/product-notifications",
      }),
    }),
    dismissProductNotification: builder.mutation<void, string>({
      query: (notificationId) => ({
        method: "POST",
        url: `/api/product-notifications/${notificationId}/dismiss`,
      }),
      onQueryStarted: async (notificationId, { dispatch, queryFulfilled }) => {
        const patchResult = dispatch(
          productNotificationApi.util.updateQueryData(
            "listProductNotifications",
            undefined,
            (notifications) => {
              const index = notifications.findIndex(
                ({ id }) => id === notificationId,
              );
              if (index >= 0) {
                notifications.splice(index, 1);
              }
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const {
  useListProductNotificationsQuery,
  useDismissProductNotificationMutation,
} = productNotificationApi;
