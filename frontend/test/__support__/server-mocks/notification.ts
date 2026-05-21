import fetchMock from "fetch-mock";

import type {
  AdminNotification,
  AdminNotificationListResponse,
  ListNotificationsRequest,
  Notification,
  NotificationId,
  WireAdminNotificationListResponse,
} from "metabase-types/api";
import { createMockNotification } from "metabase-types/api/mocks";
import { adminNotificationToWire } from "metabase-types/api/notification";

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

export const setupAdminListNotificationsEndpoint = (
  notifications: AdminNotification[] = [],
  overrides: Partial<AdminNotificationListResponse> = {},
) => {
  // The endpoint serves the wire shape (`creator_*`); the API client translates
  // it back to `owner_*`. Callers pass FE-shaped (`owner_*`) mocks for ergonomics.
  const { data, ...restOverrides } = overrides;
  const response: WireAdminNotificationListResponse = {
    data: (data ?? notifications).map(adminNotificationToWire),
    total: notifications.length,
    limit: null,
    offset: null,
    ...restOverrides,
  };
  fetchMock.get("path:/api/ee/notifications", response);
};

export const setupAdminNotificationDetailEndpoint = (
  notification: AdminNotification,
) => {
  fetchMock.get(
    `path:/api/ee/notifications/${notification.id}`,
    adminNotificationToWire(notification),
  );
};

export const setupAdminNotificationDetailErrorEndpoint = (
  id: NotificationId,
) => {
  fetchMock.get(`path:/api/ee/notifications/${id}`, { status: 500 });
};
