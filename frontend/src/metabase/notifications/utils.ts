import type {
  CardId,
  ChannelApiResponse,
  CreateAlertNotificationRequest,
  Notification,
  NotificationHandler,
  NotificationRecipient,
  ScheduleSettings,
  UserId,
} from "metabase-types/api";

export const DEFAULT_ALERT_CRON_SCHEDULE = "0 0 9 * * ?";
export const DEFAULT_ALERT_SCHEDULE: ScheduleSettings = {
  schedule_type: "daily",
  schedule_day: null,
  schedule_frame: null,
  schedule_hour: 10,
  schedule_minute: 0,
};

export const getDefaultQuestionAlertRequest = ({
  cardId,
  userId,
  channelSpec,
}: {
  cardId: CardId;
  userId: UserId;
  channelSpec: ChannelApiResponse | undefined;
}): CreateAlertNotificationRequest => {
  const recipients: NotificationRecipient[] = userId
    ? [
        {
          type: "notification-recipient/user",
          user_id: userId,
        },
      ]
    : [];

  const handlers: NotificationHandler[] = [
    {
      channel_type: "channel/email",
      recipients,
    },
  ];

  if (channelSpec?.channels.slack.configured) {
    handlers.push({
      channel_type: "channel/slack",
      recipients: [],
    });
  }

  return {
    payload_type: "notification/card",
    payload: {
      card_id: cardId,
      send_once: false,
      send_condition: "goal_above",
    },
    handlers,
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: DEFAULT_ALERT_CRON_SCHEDULE,
      },
    ],
    creator_id: userId,
  };
};

export const isAlert = (_: Notification) => true;

export const isSubscription = (_: Notification) => false;
