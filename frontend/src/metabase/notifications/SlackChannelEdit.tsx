import { t } from "ttag";

import { ChannelSettingsBlock } from "metabase/notifications/ChannelSettingsBlock";
import { SlackChannelField } from "metabase/notifications/SlackChannelField";
import type {
  ChannelType,
  CreateAlertRequest,
  SlackChannelSpec,
} from "metabase-types/api";

export const SlackChannelEdit = ({
  channelSpec,
  alert,
  onRemoveChannel,
  onChannelPropertyChange,
}: {
  channelSpec: SlackChannelSpec;
  alert: CreateAlertRequest;
  onRemoveChannel: (type: ChannelType, index: number) => void;
  onChannelPropertyChange: (index: number, name: string, value: any) => void;
}) => {
  const channelIndex = alert.channels.findIndex(
    channel => channel.channel_type === "slack",
  );
  const channel = alert.channels[channelIndex];

  return (
    <ChannelSettingsBlock
      title={t`Slack`}
      iconName="slack"
      onRemoveChannel={() => onRemoveChannel("slack", channelIndex)}
    >
      <SlackChannelField
        channel={channel}
        channelSpec={channelSpec}
        onChannelPropertyChange={(name: string, value: any) =>
          onChannelPropertyChange(channelIndex, name, value)
        }
      />
    </ChannelSettingsBlock>
  );
};
