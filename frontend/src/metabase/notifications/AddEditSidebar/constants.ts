import { t } from "ttag";

import type { ChannelType } from "metabase-types/api";

export const CHANNEL_NOUN_PLURAL: Record<ChannelType, string> = {
  get email() {
    return t`Emails`;
  },
  get slack() {
    return t`Slack messages`;
  },
  get http() {
    return t`Webhooks`;
  },
};
