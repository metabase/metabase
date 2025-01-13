import type { NotificationTriggerOption } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/types";
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
  availableTriggerOptions,
}: {
  cardId: CardId;
  userId: UserId;
  channelSpec: ChannelApiResponse | undefined;
  availableTriggerOptions: NotificationTriggerOption[];
}): CreateAlertNotificationRequest => {
  const recipients: NotificationRecipient[] = userId
    ? [
        {
          type: "notification-recipient/user",
          user_id: userId,
          details: null,
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

  const sendCondition = availableTriggerOptions[0].value;

  return {
    payload_type: "notification/card",
    payload: {
      card_id: cardId,
      send_once: false,
      send_condition: sendCondition,
    },
    handlers,
    subscriptions: [
      {
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: DEFAULT_ALERT_CRON_SCHEDULE,
      },
    ],
  };
};

export const isAlert = (_: Notification) => true;

export const isSubscription = (_: Notification) => false;
