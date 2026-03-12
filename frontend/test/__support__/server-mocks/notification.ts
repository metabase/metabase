import fetchMock from "fetch-mock";

import type {
  ListNotificationsRequest,
  Notification,
} from "metabase-types/api";
import { createMockNotification } from "metabase-types/api/mocks";

export const setupListNotificationEndpoints = (
  { card_id }: Partial<ListNotificationsRequest>,
  notifications: Notification[],
) => {
  fetchMock.get("path:/api/notification", notifications, {
    query: {
      card_id: card_id ? card_id.toString() : "",
      include_inactive: false.toString(),
    },
  });
};

export const setupCreateNotificationEndpoint = () => {
  fetchMock.post("path:/api/notification", ({ options }) => {
    return createMockNotification(JSON.parse(options.body as string));
  });
};
