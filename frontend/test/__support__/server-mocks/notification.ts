import fetchMock from "fetch-mock";

import type {
  AdminNotification,
  AdminNotificationDetail,
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
  notifications: AdminNotification[] = [],
  overrides: Partial<AdminNotificationListResponse> = {},
) => {
  const response: AdminNotificationListResponse = {
    data: notifications,
    total: notifications.length,
    limit: null,
    offset: null,
    ...overrides,
  };
  fetchMock.get("path:/api/notification/admin", response);
};

export const setupAdminNotificationDetailEndpoint = (
  notification: AdminNotification | AdminNotificationDetail,
  options?: { delay?: number },
) => {
  fetchMock.get(
    `path:/api/notification/admin/${notification.id}`,
    notification,
    options,
  );
};

export const setupAdminNotificationDetailErrorEndpoint = (
  id: NotificationId,
) => {
  fetchMock.get(`path:/api/notification/admin/${id}`, { status: 500 });
};

export const setupBulkNotificationActionEndpoint = (
  response: { updated: number } = { updated: 1 },
) => {
  fetchMock.post("path:/api/notification/admin/bulk", response);
};
