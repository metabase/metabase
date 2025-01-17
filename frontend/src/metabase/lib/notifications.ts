import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { getEmailDomain, isEmail } from "metabase/lib/email";
import {
  formatDateTimeWithUnit,
  formatTimeWithUnit,
} from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";
import { formatFrame } from "metabase/lib/time";
import * as Urls from "metabase/lib/urls";
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
  VisualizationSettings,
} from "metabase-types/api";

export const formatTitle = (item, type) => {
  switch (type) {
    case "pulse":
      return item.name;
    case "alert":
      return item.card.name;
  }
};

export const formatLink = (item, type) => {
  switch (type) {
    case "pulse":
      return Urls.dashboard({ id: item.dashboard_id });
    case "alert":
      return Urls.question(item.card);
  }
};

export const formatChannel = channel => {
  const parts = [
    formatChannelType(channel),
    formatChannelSchedule(channel),
    formatChannelDetails(channel),
  ];

  return parts.filter(p => p).join(" ");
};

export const formatChannels = channels => {
  return channels.map(channel => formatChannel(channel)).join(", ");
};

export const formatChannelType = ({ channel_type }) => {
  switch (channel_type) {
    case "email":
      return t`emailed`;
    case "slack":
      return t`slack’d`;
    default:
      return t`sent`;
  }
};

export const formatChannelSchedule = ({
  schedule_type,
  schedule_hour,
  schedule_day,
  schedule_frame,
}) => {
  const options = MetabaseSettings.formattingOptions();

  switch (schedule_type) {
    case "hourly":
      return t`hourly`;
    case "daily": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      return t`daily at ${ampm}`;
    }
    case "weekly": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      const day = formatDateTimeWithUnit(schedule_day, "day-of-week", options);
      return t`${day} at ${ampm}`;
    }
    case "monthly": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      const day = formatDateTimeWithUnit(schedule_day, "day-of-week", options);
      const frame = formatFrame(schedule_frame);
      return t`monthly on the ${frame} ${day} at ${ampm}`;
    }
  }
};

export const formatChannelDetails = ({ channel_type, details }) => {
  if (channel_type === "slack" && details) {
    return `to ${details.channel}`;
  }
};

export const formatChannelRecipients = item => {
  const emailCount = getRecipientsCount(item, "email");
  const slackCount = getRecipientsCount(item, "slack");

  const emailMessage = ngettext(
    msgid`${emailCount} email`,
    `${emailCount} emails`,
    emailCount,
  );

  const slackMessage = ngettext(
    msgid`${slackCount} Slack channel`,
    `${slackCount} Slack channels`,
    slackCount,
  );

  if (emailCount && slackCount) {
    return t`${emailMessage} and ${slackMessage}.`;
  } else if (emailCount) {
    return emailMessage;
  } else if (slackCount) {
    return slackMessage;
  }
};

export const getRecipientsCount = (item, channelType) => {
  return item.channels
    .filter(channel => channel.channel_type === channelType)
    .reduce((total, channel) => total + channel.recipients.length, 0);
};

export const canArchive = (item, user) => {
  const recipients = item.channels.flatMap(channel => {
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
  if (recipient.details.value) {
    return true;
  }

  return false;
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
