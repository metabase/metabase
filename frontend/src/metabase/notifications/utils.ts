import { c, msgid, ngettext, t } from "ttag";
import _ from "underscore";

import type { NotificationListItem } from "metabase/account/notifications/types";
import { cronToScheduleSettings } from "metabase/common/components/Schedule/cron";
import { getScheduleExplanation } from "metabase/utils/cron";
import { getEmailDomain, isEmail } from "metabase/utils/email";
import { formatDateTimeWithUnit } from "metabase/utils/formatting/date";
import { formatTimeWithUnit } from "metabase/utils/formatting/time";
import MetabaseSettings from "metabase/utils/settings";
import { formatFrame } from "metabase/utils/time-dayjs";
import type Question from "metabase-lib/v1/Question";
import type {
  CardId,
  ChannelApiResponse,
  ChannelType,
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardSendCondition,
  NotificationChannel,
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
  UserId,
  VisualizationSettings,
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
  if (!question) {
    return false;
  }

  const alertType = getAlertType(question, visualizationSettings);

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
      if (typeof schedule_hour === "number" && Number.isFinite(schedule_hour)) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        return t`Check daily at ${ampm}`;
      }
      break;
    }
    case "weekly": {
      if (
        typeof schedule_hour === "number" &&
        Number.isFinite(schedule_hour) &&
        schedule_day != null
      ) {
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
      if (
        typeof schedule_hour === "number" &&
        Number.isFinite(schedule_hour) &&
        schedule_frame != null
      ) {
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

export const ALERT_TYPE_ROWS = "alert-type-rows";
export const ALERT_TYPE_TIMESERIES_GOAL = "alert-type-timeseries-goal";
export const ALERT_TYPE_PROGRESS_BAR_GOAL = "alert-type-progress-bar-goal";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for types
const AlertTypes = [
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  ALERT_TYPE_PROGRESS_BAR_GOAL,
] as const;

export type NotificationTriggerType = (typeof AlertTypes)[number];

/**
 * Returns the type of alert that the question supports
 *
 * The `visualization_settings` in card object doesn't contain default settings,
 * so you can provide the complete visualization settings object to `alertType`
 * for taking those into account
 */
export function getAlertType(
  question: Question,
  visualizationSettings?: VisualizationSettings,
) {
  const display = question.display();

  if (!question.canRun()) {
    return null;
  }

  const isLineAreaBar =
    display === "line" || display === "area" || display === "bar";

  if (display === "progress") {
    return ALERT_TYPE_PROGRESS_BAR_GOAL;
  } else if (isLineAreaBar) {
    const vizSettings = visualizationSettings
      ? visualizationSettings
      : question.card().visualization_settings;
    const goalEnabled = vizSettings["graph.show_goal"];
    const hasSingleYAxisColumn =
      vizSettings["graph.metrics"] && vizSettings["graph.metrics"].length === 1;

    // We don't currently support goal alerts for multiseries question
    if (goalEnabled && hasSingleYAxisColumn) {
      return ALERT_TYPE_TIMESERIES_GOAL;
    } else {
      return ALERT_TYPE_ROWS;
    }
  } else {
    return ALERT_TYPE_ROWS;
  }
}
