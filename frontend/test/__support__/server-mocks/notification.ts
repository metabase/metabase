import fetchMock from "fetch-mock";

import type {
  AdminNotificationDetail,
  AdminNotificationListItem,
  AdminNotificationListResponse,
  ListNotificationsRequest,
  Notification,
  NotificationId,
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

export const setupAdminListNotificationsEndpoint = (
  notifications: AdminNotificationListItem[] = [],
  overrides: Partial<AdminNotificationListResponse> = {},
) => {
  const response: AdminNotificationListResponse = {
    data: notifications,
    total: notifications.length,
    limit: null,
    offset: null,
    ...overrides,
  };
  fetchMock.get("path:/api/ee/notifications", response);
};

export const setupAdminNotificationDetailEndpoint = (
  notification: AdminNotificationDetail,
) => {
  fetchMock.get(`path:/api/ee/notifications/${notification.id}`, notification);
};

export const setupAdminNotificationDetailErrorEndpoint = (
  id: NotificationId,
) => {
  fetchMock.get(`path:/api/ee/notifications/${id}`, { status: 500 });
};
