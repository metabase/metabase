import { c, msgid, ngettext, t } from "ttag";
import _ from "underscore";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { cronToScheduleSettings } from "metabase/admin/performance/utils";
import { getEmailDomain, isEmail } from "metabase/lib/email";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { formatTimeWithUnit } from "metabase/lib/formatting/time";
import MetabaseSettings from "metabase/lib/settings";
import { formatFrame } from "metabase/lib/time";
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
  NotificationCronSubscription,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationRecipient,
  NotificationRecipientRawValue,
  ScheduleSettings,
  UpdateAlertNotificationRequest,
  User,
  VisualizationSettings,
} from "metabase-types/api";

import { getScheduleExplanation } from "./cron";

export const formatTitle = ({ item, type }: NotificationListItem) => {
  switch (type) {
    case "pulse":
      return item.name;
    case "question-notification":
      return item.payload.card?.name || t`Alert`;
  }
};

const getRecipientIdentity = (recipient: NotificationRecipient) => {
  if (recipient.type === "notification-recipient/user") {
    return recipient.user_id;
  }

  if (recipient.type === "notification-recipient/raw-value") {
    return recipient.details.value; // email
  }
};

export const canArchive = (item: Notification, user: User) => {
  const recipients = item.handlers.flatMap((channel) => {
    if (channel.recipients) {
      return channel.recipients.map(getRecipientIdentity);
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
    handlers.every((handlers) => channelIsValid(handlers)) &&
    handlers.every((c) => {
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

  notification.handlers.forEach((handler) => {
    result[handler.channel_type] = true;
  });

  return result;
};

export const getNotificationHandlersGroupedByTypes = (
  notificationHandlers: NotificationHandler[],
) => {
  let emailHandler: NotificationHandlerEmail | undefined;
  let slackHandler: NotificationHandlerSlack | undefined;
  let hookHandlers: NotificationHandlerHttp[] | undefined;

  notificationHandlers.forEach((handler) => {
    if (handler.channel_type === "channel/email") {
      emailHandler = handler;
      return;
    }

    if (handler.channel_type === "channel/slack") {
      slackHandler = handler;
      return;
    }

    if (handler.channel_type === "channel/http") {
      if (!hookHandlers) {
        hookHandlers = [];
      }

      hookHandlers.push(handler);
      return;
    }
  });

  return { emailHandler, slackHandler, hookHandlers };
};

export const formatNotificationSchedule = (
  subscription: NotificationCronSubscription,
): string | null => {
  const schedule = cronToScheduleSettings(
    subscription.cron_schedule,
    subscription.ui_display_type === "cron/raw",
  );

  return (
    (schedule &&
      formatNotificationCheckSchedule(schedule, subscription.cron_schedule)) ||
    null
  );
};

export const formatNotificationCheckSchedule = (
  {
    schedule_type,
    schedule_minute,
    schedule_hour,
    schedule_day,
    schedule_frame,
  }: ScheduleSettings,
  cronSchedule: string,
) => {
  const options = MetabaseSettings.formattingOptions();

  switch (schedule_type) {
    case "every_n_minutes":
      // Converting to lowercase here, because 'minute` is used without pluralization on the backend.
      // and it's impossible to have both pluralized and single form for the same string.
      return t`Check every ${ngettext(msgid`Minute`, `${schedule_minute} Minutes`, schedule_minute || 0).toLocaleLowerCase()}`;
    case "hourly":
      return t`Check hourly`;
    case "daily": {
      if (schedule_hour != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        return t`Check daily at ${ampm}`;
      }
      break;
    }
    case "weekly": {
      if (schedule_hour != null && schedule_day != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        const day = formatDateTimeWithUnit(
          schedule_day,
          "day-of-week",
          options,
        );
        return t`Check on ${day} at ${ampm}`;
      }
      break;
    }
    case "monthly": {
      if (schedule_hour != null && schedule_frame != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        const day = schedule_day
          ? formatDateTimeWithUnit(schedule_day, "day-of-week", options)
          : t`day`;
        const frame = formatFrame(schedule_frame);
        return t`Check monthly on the ${frame} ${day} at ${ampm}`;
      }
      break;
    }
    case "cron":
      try {
        return t`Check ${getScheduleExplanation(cronSchedule)}`;
      } catch {
        return null;
      }
  }

  return null;
};

export const formatNotificationScheduleDescription = ({
  schedule_type,
  schedule_hour,
}: ScheduleSettings) => {
  switch (schedule_type) {
    case "daily":
    case "weekly":
    case "monthly": {
      if (schedule_hour != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day");
        return c("time with AM/PM label").t`at ${ampm}`;
      }
      break;
    }
    default:
      return "";
  }
};
