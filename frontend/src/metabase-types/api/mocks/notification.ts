import type {
  AlertNotification,
  NotificationCronSubscription,
  NotificationHandlerEmail,
  NotificationHandlerSlack,
  NotificationRecipientUser,
  NotificationSystemEventSubscription,
  TableNotification,
} from "metabase-types/api";
import { createMockUserInfo } from "metabase-types/api/mocks/user";

import { createMockTable } from "./table";

export const createMockAlertNotification = (
  opts?: Partial<AlertNotification>,
): AlertNotification => ({
  payload_id: 7,
  payload: {
    id: 7,
    card_id: 1,
    send_once: false,
    send_condition: "has_result",
    created_at: "2025-01-07T18:40:47.245205+03:00",
    updated_at: "2025-01-07T18:40:47.245205+03:00",
  },
  creator: createMockUserInfo({ ...opts?.creator }),
  payload_type: "notification/card",
  handlers: [createMockNotificationHandlerEmail()],
  creator_id: 3,
  subscriptions: [createMockNotificationCronSubscription()],
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  active: true,
  id: 10,
  created_at: "2025-01-07T18:40:47.245205+03:00",
  ...opts,
});

export const createMockNotificationHandlerEmail = (
  opts?: Partial<NotificationHandlerEmail>,
): NotificationHandlerEmail => ({
  template_id: null,
  channel_type: "channel/email",
  channel: null,
  template: null,
  recipients: [
    {
      type: "notification-recipient/user",
      updated_at: "2025-01-07T18:40:47.245205+03:00",
      permissions_group_id: null,
      details: null,
      id: 9,
      user_id: 1,
      notification_handler_id: 12,
      user: createMockUserInfo(),
      created_at: "2025-01-07T18:40:47.245205+03:00",
    },
  ],
  channel_id: null,
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  notification_id: 10,
  active: true,
  id: 12,
  created_at: "2025-01-07T18:40:47.245205+03:00",
  ...opts,
});

export const createMockNotificationRecipientUser = (
  opts?: Partial<NotificationRecipientUser>,
): NotificationRecipientUser => ({
  type: "notification-recipient/user",
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  permissions_group_id: null,
  details: null,
  id: 9,
  user_id: 1,
  notification_handler_id: 12,
  user: createMockUserInfo(),
  created_at: "2025-01-07T18:40:47.245205+03:00",
  ...opts,
});

export const createMockNotificationHandlerSlack = (
  opts?: Partial<NotificationHandlerSlack>,
): NotificationHandlerSlack => ({
  template_id: null,
  channel_type: "channel/slack",
  channel: null,
  template: null,
  recipients: [],
  channel_id: null,
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  notification_id: 10,
  active: true,
  id: 13,
  created_at: "2025-01-07T18:40:47.245205+03:00",
  ...opts,
});

export const createMockNotificationCronSubscription = (
  opts?: Partial<NotificationCronSubscription>,
): NotificationCronSubscription => ({
  id: 10,
  notification_id: 10,
  type: "notification-subscription/cron",
  event_name: null,
  created_at: "2025-01-07T18:40:47.245205+03:00",
  cron_schedule: "0 0 9 * * ?",
  ui_display_type: "cron/builder",
  ...opts,
});

export const createMockNotificationSystemEventSubscription = (
  opts?: Partial<NotificationSystemEventSubscription>,
): NotificationSystemEventSubscription => ({
  id: 11,
  notification_id: 10,
  type: "notification-subscription/system-event",
  event_name: "event/data-editing-row-create",
  table_id: 42,
  table: createMockTable(),
  created_at: "2025-01-07T18:40:47.245205+03:00",
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  ui_display_type: null,
  cron_schedule: null,
  ...opts,
});

export const createMockTableNotification = (
  opts?: Partial<TableNotification>,
): TableNotification => ({
  id: 1,
  payload_id: null,
  payload_type: "notification/system-event",
  payload: null,
  creator: createMockUserInfo(),
  creator_id: 3,
  handlers: [createMockNotificationHandlerEmail()],
  subscriptions: [createMockNotificationSystemEventSubscription()],
  created_at: "2025-01-07T18:40:47.245205+03:00",
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  active: true,
  condition: ["=", ["value"], true],
  ...opts,
});
