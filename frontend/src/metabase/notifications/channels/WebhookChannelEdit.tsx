import { ChannelSettingsBlock } from "metabase/notifications/channels/ChannelSettingsBlock";
import type { NotificationChannel } from "metabase-types/api";

export const WebhookChannelEdit = ({
  notificationChannel,
  onRemoveChannel,
}: {
  onRemoveChannel: () => void;
  notificationChannel: NotificationChannel;
}) => {
  return (
    <ChannelSettingsBlock
      title={notificationChannel.name}
      iconName="webhook"
      onRemoveChannel={onRemoveChannel}
    />
  );
};
