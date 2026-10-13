import fetchMock, { type CallLog, type UserRouteConfig } from "fetch-mock";

import type {
  AdminNotification,
  AdminNotificationCountsResponse,
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
    // Unjustified type cast. FIXME
    return createMockNotification(JSON.parse(options.body as string));
  });
};

export const setupAdminNotificationCountsEndpoint = (
  response: AdminNotificationCountsResponse,
  options?: UserRouteConfig,
) => {
  fetchMock.get("path:/api/notification/admin/counts", response, options);
};

export const setupAdminNotificationCountsErrorEndpoint = () => {
  fetchMock.get("path:/api/notification/admin/counts", { status: 500 });
};

export const setupAdminListNotificationsEndpoint = (
  response:
    | AdminNotification[]
    | ((
        call: CallLog,
      ) =>
        | AdminNotificationListResponse
        | Promise<AdminNotificationListResponse>) = [],
  overrides: Partial<AdminNotificationListResponse> = {},
) => {
  const body =
    typeof response === "function"
      ? response
      : {
          data: response,
          total: response.length,
          limit: null,
          offset: null,
          ...overrides,
        };
  fetchMock.get("path:/api/notification/admin", body);
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
