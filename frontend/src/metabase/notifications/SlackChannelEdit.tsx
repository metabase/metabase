import { t } from "ttag";

import { ChannelSettingsBlock } from "metabase/notifications/ChannelSettingsBlock";
import { SlackChannelField } from "metabase/notifications/SlackChannelField";
import type {
  NotificationHandlerSlack,
  SlackChannelSpec,
} from "metabase-types/api";

export const SlackChannelEdit = ({
  channel,
  channelSpec,
  onRemoveChannel,
  onChange,
}: {
  channel: NotificationHandlerSlack;
  channelSpec: SlackChannelSpec;
  onRemoveChannel: () => void;
  onChange: (newConfig: NotificationHandlerSlack) => void;
}) => {
  return (
    <ChannelSettingsBlock
      title={t`Slack`}
      iconName="int"
      onRemoveChannel={onRemoveChannel}
    >
      <SlackChannelField
        channel={channel}
        channelSpec={channelSpec}
        onChange={onChange}
      />
    </ChannelSettingsBlock>
  );
};
