import type {
  CardId,
  ChannelApiResponse,
  CreateAlertNotificationRequest,
  NotificationChannel,
  NotificationHandler,
  ScheduleSettings,
  UserId,
} from "metabase-types/api";

import type { NotificationTriggerOption } from "./modals/CreateOrEditQuestionAlertModal/types";

export const DEFAULT_ALERT_CRON_SCHEDULE = "0 0 8 * * ? *";
export const DEFAULT_ALERT_SCHEDULE: ScheduleSettings = {
  schedule_type: "daily",
  schedule_day: null,
  schedule_frame: null,
  schedule_hour: 8,
  schedule_minute: 0,
};

const getDefaultChannelConfig = ({
  channelSpec,
  hookChannels,
  currentUserId,
  userCanAccessSettings,
}: {
  channelSpec: ChannelApiResponse;
  hookChannels: NotificationChannel[];
  currentUserId: UserId;
  userCanAccessSettings: boolean;
}): NotificationHandler[] => {
  if (channelSpec.channels.email?.configured) {
    const handlers: NotificationHandler[] = [
      {
        channel_type: "channel/email",
        recipients: [
          {
            type: "notification-recipient/user",
            user_id: currentUserId,
            details: null,
          },
        ],
      },
    ];

    return handlers;
  }

  if (channelSpec.channels.slack?.configured) {
    const handlers: NotificationHandler[] = [
      {
        channel_type: "channel/slack",
        recipients: [],
      },
    ];

    return handlers;
  }

  if (
    channelSpec.channels.http?.configured &&
    hookChannels.length > 0 &&
    userCanAccessSettings
  ) {
    const channel = hookChannels[0];
    const handlers: NotificationHandler[] = [
      {
        channel_type: "channel/http",
        channel_id: channel.id,
        recipients: [],
      },
    ];

    return handlers;
  }

  return [];
};

export const getDefaultQuestionAlertRequest = ({
  cardId,
  currentUserId,
  channelSpec,
  hookChannels,
  availableTriggerOptions,
  userCanAccessSettings,
}: {
  cardId: CardId;
  currentUserId: UserId;
  channelSpec: ChannelApiResponse;
  hookChannels: NotificationChannel[];
  availableTriggerOptions: NotificationTriggerOption[];
  userCanAccessSettings: boolean;
}): CreateAlertNotificationRequest => {
  const sendCondition = availableTriggerOptions[0].value;

  return {
    payload_type: "notification/card",
    payload: {
      card_id: cardId,
      send_once: false,
      send_condition: sendCondition,
    },
    handlers: getDefaultChannelConfig({
      channelSpec,
      hookChannels,
      currentUserId,
      userCanAccessSettings,
    }),
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: DEFAULT_ALERT_CRON_SCHEDULE,
        ui_display_type: "cron/builder",
      },
    ],
  };
};
