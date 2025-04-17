import { t } from "ttag";

import type { ChannelType } from "metabase-types/api";

export const CHANNEL_NOUN_PLURAL: Record<ChannelType, string> = {
  email: t`Emails`,
  slack: t`Slack messages`,
  http: t`Webhooks`,
};
