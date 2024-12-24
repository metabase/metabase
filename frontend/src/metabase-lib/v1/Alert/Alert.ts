import { isNotNull } from "metabase/lib/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Channel,
  ChannelApiResponse,
  CreateAlertRequest,
} from "metabase-types/api";
import type { User } from "metabase-types/api/user";

import { ALERT_TYPE_ROWS, type NotificationTriggerType } from "./constants";

export const ALERT_DEFAULT_SLACK_CHANNEL_CONFIG: Channel = {
  enabled: true,
  channel_type: "slack",
  schedule_day: "mon" as const,
  schedule_frame: null,
  schedule_hour: 0,
  schedule_type: "daily" as const,
};

export const getDefaultAlert = (
  question: Question | undefined,
  alertType: NotificationTriggerType,
  user: User | null,
  channelSpec: ChannelApiResponse | undefined,
): CreateAlertRequest => {
  const typeDependentAlertFields =
    alertType === ALERT_TYPE_ROWS
      ? {
          alert_condition: "rows" as const,
          alert_first_only: false,
          alert_above_goal: false,
        }
      : {
          alert_condition: "goal" as const,
          alert_first_only: true,
          alert_above_goal: true,
        };

  return {
    card: {
      id: question ? question.id() : -1,
      include_csv: false,
      include_xls: false,
    },
    channels: [
      {
        enabled: true,
        channel_type: "email",
        recipients: user ? [user] : [],
        schedule_day: "mon" as const,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily" as const,
      },
      channelSpec?.channels.slack.configured
        ? ALERT_DEFAULT_SLACK_CHANNEL_CONFIG
        : null,
    ].filter(isNotNull),
    ...typeDependentAlertFields,
  };
};
