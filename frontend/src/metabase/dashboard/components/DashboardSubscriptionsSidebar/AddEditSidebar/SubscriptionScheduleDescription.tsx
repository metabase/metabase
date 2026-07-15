import { c, t } from "ttag";

import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";
import type { ChannelSpec } from "metabase-types/api";

import { CHANNEL_NOUN_PLURAL } from "./constants";

interface SubscriptionScheduleDescriptionProps {
  channelSpec: ChannelSpec;
  description: string;
}

export const SubscriptionScheduleDescription = ({
  channelSpec,
  description,
}: SubscriptionScheduleDescriptionProps) => {
  const applicationName = useSelector(getApplicationName);
  const timezone = useSelector((state) =>
    getSetting(state, "report-timezone-short"),
  );
  const channelNoun =
    (channelSpec?.type && CHANNEL_NOUN_PLURAL[channelSpec.type]) ?? t`Messages`;

  const actionText = c("{0} is a noun like 'Emails' or 'Slack messages'")
    .t`${channelNoun} will be sent`;
  const timezoneLabel = c(
    "An additional clarification for a human-readable schedule description",
  ).t`${timezone}, your ${applicationName} timezone.`;

  return (
    <Text c="text-secondary">{`${actionText} ${description} ${timezoneLabel}`}</Text>
  );
};
