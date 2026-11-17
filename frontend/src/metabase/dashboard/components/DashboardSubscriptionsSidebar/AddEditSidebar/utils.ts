import { c, t } from "ttag";

import { formatNotificationScheduleDescription } from "metabase/notifications/utils";
import type { ChannelSpec, ScheduleSettings } from "metabase-types/api";

import { CHANNEL_NOUN_PLURAL } from "./constants";

interface GetSubscriptionScheduleDescriptionOpts {
  schedule: ScheduleSettings;
  channelSpec: ChannelSpec;
  applicationName: string;
  timezone: string | null;
}

export const getSubscriptionScheduleDescription = ({
  schedule,
  channelSpec,
  applicationName,
  timezone,
}: GetSubscriptionScheduleDescriptionOpts): string | null => {
  const description = formatNotificationScheduleDescription(schedule);
  if (!description) {
    return null;
  }

  const channelNoun =
    (channelSpec?.type && CHANNEL_NOUN_PLURAL[channelSpec.type]) ?? t`Messages`;

  const actionText = c("{0} is a noun like 'Emails' or 'Slack messages'")
    .t`${channelNoun} will be sent`;
  const timezoneLabel = c(
    "An additional clarification for a human-readable schedule description",
  ).t`${timezone}, your ${applicationName} timezone.`;

  return `${actionText} ${description} ${timezoneLabel}`;
};
