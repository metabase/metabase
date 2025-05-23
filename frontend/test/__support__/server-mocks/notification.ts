import fetchMock from "fetch-mock";

import type {
  ListNotificationsRequest,
  Notification,
} from "metabase-types/api";

export const setupListNotificationEndpoints = (
  { card_id }: Partial<ListNotificationsRequest>,
  notifications: Notification[],
) => {
  fetchMock.get("path:/api/notification", notifications, {
    query: {
      card_id,
      include_inactive: false,
    },
  });
};
