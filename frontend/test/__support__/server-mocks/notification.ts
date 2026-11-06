import fetchMock from "fetch-mock";

import type {
  ListNotificationsRequest,
  Notification,
  UnsubscribeResponse,
} from "metabase-types/api";

export const setupUnsubscribeFromNotificationByEmailEndpoint = (
  response: UnsubscribeResponse,
  { status = 200 }: { status?: number } = {},
) => {
  fetchMock.post("path:/api/notification/unsubscribe", {
    status,
    body: response,
  });
};

export const setupUndoUnsubscribeFromNotificationByEmailEndpoint = (
  response: UnsubscribeResponse,
) => {
  fetchMock.post("path:/api/notification/unsubscribe/undo", response);
};

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
