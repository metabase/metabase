import { t } from "ttag";
import _ from "underscore";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { getEmailDomain, isEmail } from "metabase/lib/email";
import MetabaseSettings from "metabase/lib/settings";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_TIMESERIES_GOAL,
} from "metabase-lib/v1/Alert";
import type Question from "metabase-lib/v1/Question";
import type {
  ChannelApiResponse,
  ChannelType,
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardSendCondition,
  NotificationChannelType,
  NotificationHandler,
  NotificationRecipient,
  NotificationRecipientRawValue,
  UpdateAlertNotificationRequest,
  User,
  VisualizationSettings,
} from "metabase-types/api";

export const formatTitle = ({ item, type }: NotificationListItem) => {
  switch (type) {
    case "pulse":
      return item.name;
    case "question-notification":
      return item.payload.card?.name || t`Alert`;
  }
};

export const canArchive = (item: Notification, user: User) => {
  const recipients = item.handlers.flatMap(channel => {
    if (channel.recipients) {
      return channel.recipients.map(recipient => recipient.id);
    } else {
      return [];
    }
  });

  const isCreator = item.creator?.id === user.id;
  const isSubscribed = recipients.includes(user.id);
  const isOnlyRecipient = recipients.length === 1;

  return isCreator && (!isSubscribed || isOnlyRecipient);
};

export function emailHandlerRecipientIsValid(recipient: NotificationRecipient) {
  if (recipient.type === "notification-recipient/user") {
    return !!recipient.user_id;
  }

  if (recipient.type === "notification-recipient/raw-value") {
    const email = recipient.details.value;

    const recipientDomain = getEmailDomain(email);
    const allowedDomains = MetabaseSettings.subscriptionAllowedDomains();
    return (
      !!email &&
      isEmail(email) &&
      (_.isEmpty(allowedDomains) ||
        !!(recipientDomain && allowedDomains.includes(recipientDomain)))
    );
  }
}

export function slackHandlerRecipientIsValid(
  recipient: NotificationRecipientRawValue,
) {
  return !!recipient.details.value;
}

export function channelIsValid(handlers: NotificationHandler) {
  switch (handlers.channel_type) {
    case "channel/email":
      return (
        handlers.recipients &&
        handlers.recipients.length > 0 &&
        handlers.recipients.every(emailHandlerRecipientIsValid)
      );
    case "channel/slack":
      return (
        handlers.recipients &&
        handlers.recipients.length > 0 &&
        handlers.recipients.every(slackHandlerRecipientIsValid)
      );
    case "channel/http":
      return handlers.channel_id;
    default:
      return false;
  }
}

const notificationHandlerTypeToChannelMap: Record<
  NotificationChannelType,
  ChannelType
> = {
  ["channel/email"]: "email",
  ["channel/slack"]: "slack",
  ["channel/http"]: "http",
};

export function alertIsValid(
  notification: CreateAlertNotificationRequest | UpdateAlertNotificationRequest,
  channelSpec: ChannelApiResponse | undefined,
) {
  const handlers = notification.handlers;

  return (
    channelSpec?.channels &&
    handlers.length > 0 &&
    handlers.every(handlers => channelIsValid(handlers)) &&
    handlers.every(c => {
      const handlerChannelType =
        notificationHandlerTypeToChannelMap[c.channel_type];

      return channelSpec?.channels[handlerChannelType]?.configured;
    })
  );
}

function hasProperGoalForAlert({
  question,
  visualizationSettings,
}: {
  question: Question | undefined;
  visualizationSettings: VisualizationSettings;
}): boolean {
  const alertType = question?.alertType(visualizationSettings);

  if (!alertType) {
    return false;
  }

  return (
    alertType === ALERT_TYPE_TIMESERIES_GOAL ||
    alertType === ALERT_TYPE_PROGRESS_BAR_GOAL
  );
}

export function getAlertTriggerOptions({
  question,
  visualizationSettings,
}: {
  question: Question | undefined;
  visualizationSettings: VisualizationSettings;
}): NotificationCardSendCondition[] {
  const hasValidGoal = hasProperGoalForAlert({
    question,
    visualizationSettings,
  });

  if (hasValidGoal) {
    return ["has_result", "goal_above", "goal_below"];
  }

  return ["has_result"];
}

type NotificationEnabledChannelsMap = {
  [key in NotificationChannelType]?: true;
};
export const getNotificationEnabledChannelsMap = (
  notification: Notification,
): NotificationEnabledChannelsMap => {
  const result: NotificationEnabledChannelsMap = {};

  notification.handlers.forEach(handler => {
    result[handler.channel_type] = true;
  });

  return result;
};
