import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  Channel,
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";

/**
 * Why the dashboard's subscriptions sidebar can't open this channel's edit
 * form, or `null` when it can. The sidebar has an edit form for email and
 * Slack, and opens it whenever `form_input` lists the channel type, set up or
 * not, so a subscription can still be changed or deleted after its channel
 * stops working. It has no edit form for webhooks.
 */
export function getSubscriptionEditUnavailableReason(
  { channel_type }: Pick<Channel, "channel_type">,
  channelInfo: ChannelApiResponse,
): string | null {
  const hasChannelSpec = channelInfo.channels[channel_type] != null;
  return match(channel_type)
    .with("email", () =>
      hasChannelSpec ? null : t`You can't edit email subscriptions`,
    )
    .with("slack", () =>
      hasChannelSpec ? null : t`You can't edit Slack subscriptions`,
    )
    .with(
      "http",
      () => t`Webhook subscriptions can't be edited on the dashboard`,
    )
    .exhaustive();
}

/**
 * The channel the dashboard edits a subscription through, its first, or
 * `null` when it has none or the sidebar can't edit it.
 */
export function getEditableSubscriptionChannel(
  { channels: [channel] }: Pick<DashboardSubscription, "channels">,
  channelInfo: ChannelApiResponse,
): Channel | null {
  return channel != null &&
    getSubscriptionEditUnavailableReason(channel, channelInfo) == null
    ? channel
    : null;
}
