import type {
  Channel,
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";

export function getEditableSubscriptionChannel(
  { channels: [channel] }: Pick<DashboardSubscription, "channels">,
  channelInfo: ChannelApiResponse,
): Channel | null {
  const isEditable =
    channel != null &&
    channel.channel_type !== "http" &&
    channelInfo.channels[channel.channel_type] != null;
  return isEditable ? channel : null;
}
