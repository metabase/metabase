import { t } from "ttag";

import { Button, Group, Icon, type IconName, Menu, Text } from "metabase/ui";
import type { NotificationChannelType } from "metabase-types/api";

const CHANNEL_TYPE_TO_ICON_MAP: Record<NotificationChannelType, IconName> = {
  "channel/email": "mail",
  "channel/slack": "int",
  "channel/http": "webhook",
};

export type ChannelToAddOption = {
  type: NotificationChannelType;
  name: string;
  channel_id?: number; // only for "channel/http" type
};

type NotificationChannelsAddMenuProps = {
  channelsToAdd: ChannelToAddOption[];
  onAddChannel: (channel: ChannelToAddOption) => void;
};

export const NotificationChannelsAddMenu = ({
  channelsToAdd,
  onAddChannel,
}: NotificationChannelsAddMenuProps) => {
  return (
    <Menu position="bottom-start">
      {/* TODO: this doesn't close on click outside */}
      <Menu.Target>
        <Button variant="subtle">{t`Add another destination`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {channelsToAdd.map(channel => (
          <Menu.Item
            key={channel.channel_id || channel.name}
            onClick={() => onAddChannel(channel)}
          >
            <Group spacing="md" align="center">
              <Icon name={CHANNEL_TYPE_TO_ICON_MAP[channel.type]} />
              <Text>{channel.name}</Text>
            </Group>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
