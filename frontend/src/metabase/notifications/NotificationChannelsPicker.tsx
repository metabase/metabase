import { t } from "ttag";

import { useListChannelsQuery } from "metabase/api";
import { Button, Menu, Stack } from "metabase/ui";
import type {
  ChannelApiResponse,
  NotificationChannel,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerSlack,
  User,
} from "metabase-types/api";

import { EmailChannelEdit } from "./EmailChannelEdit";
import { SlackChannelEdit } from "./SlackChannelEdit";
import { WebhookChannelEdit } from "./WebhookChannelEdit";

const DEFAULT_CHANNELS_CONFIG = {
  email: { name: t`Email`, type: "email" },
  slack: { name: t`Slack`, type: "slack" },
  http: { name: t`Http`, type: "http" },
};

interface NotificationChannelsPickerProps {
  notificationHandlers: NotificationHandler[];
  channels: ChannelApiResponse["channels"] | undefined;
  users: User[];
  onChange: (newHandlers: NotificationHandler[]) => void;
  emailRecipientText: string;
  getInvalidRecipientText: (domains: string) => string;
  isAdminUser: boolean;
}

export const NotificationChannelsPicker = ({
  notificationHandlers,
  channels: nullableChannels,
  users,
  onChange,
  getInvalidRecipientText,
  isAdminUser,
}: NotificationChannelsPickerProps) => {
  const { data: notificationChannels = [] } = useListChannelsQuery();

  console.log("NotificationChannelsPicker", {
    notificationHandlers,
    channels: nullableChannels,
    notificationChannels,
  });

  const addChannel = (channel: NotificationChannel) => {
    // const channelSpec = channels[type];
    // if (!channelSpec) {
    //   return;
    // }

    const newChannel: NotificationHandler = {
      channel_type: "channel/http",
      recipients: [],
    };

    onChange(notificationHandlers.concat(newChannel));
  };

  const onChannelChange = (
    oldConfig: NotificationHandler,
    newConfig: NotificationHandler,
  ) => {
    const updatedChannels = notificationHandlers.map(value =>
      value === oldConfig ? newConfig : value,
    );

    onChange(updatedChannels);
  };

  const onRemoveChannel = (channel: NotificationHandler) => {
    const updatedChannels = notificationHandlers.filter(
      value => value !== channel,
    );

    onChange(updatedChannels);
  };

  // Default to show the default channels until full formInput is loaded
  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  const emailChannel = notificationHandlers.find(
    ({ channel_type }) => channel_type === "channel/email",
  ) as NotificationHandlerEmail | undefined;
  const slackChannel = notificationHandlers.find(
    ({ channel_type }) => channel_type === "channel/slack",
  ) as NotificationHandlerSlack | undefined;
  // const hookChannels = notificationHandlers.filter(
  //   ({ channel_type }) =>
  //     channel_type !== "channel/email" && channel_type !== "channel/slack",
  // );

  return (
    <Stack spacing="xl" align="start">
      {channels.email.configured && !!emailChannel && (
        <EmailChannelEdit
          channel={emailChannel}
          users={users}
          invalidRecipientText={getInvalidRecipientText}
          onChange={newConfig => onChannelChange(emailChannel, newConfig)}
          onRemoveChannel={() => onRemoveChannel(emailChannel)}
        />
      )}

      {channels.slack.configured && !!slackChannel && (
        <SlackChannelEdit
          channel={slackChannel}
          channelSpec={channels.slack}
          onChange={newConfig => onChannelChange(slackChannel, newConfig)}
          onRemoveChannel={() => onRemoveChannel(slackChannel)}
        />
      )}

      {/*
      TODO: implement webhook channels
      {isAdminUser &&
        hookChannels.map(channel => (
          <WebhookChannelEdit
            key={`webhook-${channel.id}`}
            channel={channel}
            channelSpec={channels.http}
            onRemoveChannel={onRemoveChannel}
          />
        ))}*/}

      <Menu position="bottom-start">
        {/* TODO: this doesn't close on click outside */}
        <Menu.Target>
          <Button variant="subtle">{t`Add another destination`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {notificationChannels.map(httpChannel => (
            <Menu.Item
              key={httpChannel.id}
              onClick={() => addChannel(httpChannel)}
            >
              {httpChannel.type} | {httpChannel.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Stack>
  );
};
