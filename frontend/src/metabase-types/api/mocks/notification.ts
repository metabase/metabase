import type { Notification } from "metabase-types/api";
import { createMockUserInfo } from "metabase-types/api/mocks/user";

export const createMockNotification = (
  opts?: Partial<Notification>,
): Notification => ({
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
  handlers: [
    {
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
    },
    {
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
    },
  ],
  creator_id: 3,
  subscriptions: [
    {
      id: 10,
      notification_id: 10,
      type: "notification-subscription/cron",
      event_name: null,
      created_at: "2025-01-07T18:40:47.245205+03:00",
      cron_schedule: "0 0 9 * * ?",
    },
  ],
  updated_at: "2025-01-07T18:40:47.245205+03:00",
  active: true,
  id: 10,
  created_at: "2025-01-07T18:40:47.245205+03:00",
  ...opts,
});
