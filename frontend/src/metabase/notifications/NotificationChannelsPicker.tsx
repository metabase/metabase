import { assoc, updateIn } from "icepick";
import { t } from "ttag";

import { useListChannelsQuery } from "metabase/api/channel";
import { createChannel } from "metabase/lib/pulse";
import { Button, Menu, Stack } from "metabase/ui";
import type {
  Channel,
  ChannelApiResponse,
  ChannelType,
  CreateAlertRequest,
  NotificationChannel,
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
  alert: CreateAlertRequest;
  channels: ChannelApiResponse["channels"] | undefined;
  users: User[];
  onAlertChange: (value: CreateAlertRequest) => void;
  emailRecipientText: string;
  getInvalidRecipientText: (domains: string) => string;
  isAdminUser: boolean;
}

export const NotificationChannelsPicker = ({
  alert,
  channels: nullableChannels,
  users,
  onAlertChange,
  getInvalidRecipientText,
  isAdminUser,
}: NotificationChannelsPickerProps) => {
  const { data: notificationChannels = [] } = useListChannelsQuery();

  // console.log("NotificationChannelsPicker", {
  //   alert,
  //   channels: nullableChannels,
  // });

  const addChannel = (
    type: ChannelType,
    notification?: NotificationChannel,
  ) => {
    const channelSpec = channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(
      channelSpec,
      notification ? { channel_id: notification.id } : undefined,
    );

    onAlertChange({ ...alert, channels: alert.channels.concat(channel) });
  };

  const onChannelPropertyChange = (index: number, name: string, value: any) => {
    const channels = [...alert.channels];

    channels[index] = { ...channels[index], [name]: value };

    onAlertChange({ ...alert, channels });
  };

  const onRemoveChannel = (type: ChannelType, index: number) => {
    const channel = alert.channels[index];

    const shouldRemoveChannel =
      type === "email" && channel?.recipients?.length === 0;

    const updatedPulse = shouldRemoveChannel
      ? updateIn(alert, ["channels"], channels => channels.toSpliced(index, 1))
      : updateIn(alert, ["channels", index], (channel: Channel) =>
          assoc(channel, "enabled", false),
        );
    onAlertChange(updatedPulse);
  };

  const onAddChannel = (
    type: ChannelType,
    index: number,
    notification?: NotificationChannel,
  ) => {
    if (alert.channels[index]) {
      onAlertChange(
        updateIn(alert, ["channels", index], (channel: Channel) =>
          assoc(channel, "enabled", true),
        ),
      );
    } else {
      addChannel(type, notification);
    }
  };

  // Default to show the default channels until full formInput is loaded
  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  const hasEnabledSlackForAlert = !!alert.channels.find(
    ({ channel_type }) => channel_type === "slack",
  );

  return (
    <Stack spacing="xl" align="start">
      <EmailChannelEdit
        alert={alert}
        users={users}
        invalidRecipientText={getInvalidRecipientText}
        onRemoveChannel={onRemoveChannel}
        onChannelPropertyChange={onChannelPropertyChange}
      />
      {channels.slack.configured && hasEnabledSlackForAlert && (
        <SlackChannelEdit
          alert={alert}
          channelSpec={channels.slack}
          onRemoveChannel={onRemoveChannel}
          onChannelPropertyChange={onChannelPropertyChange}
        />
      )}
      {isAdminUser &&
        notificationChannels.map(notification => (
          <WebhookChannelEdit
            key={`webhook-${notification.id}`}
            toggleChannel={onRemoveChannel}
            channelSpec={channels.http}
            alert={alert}
            notification={notification}
          />
        ))}

      <Menu position="bottom-start">
        {/* TODO: this doesn't close on click outside */}
        <Menu.Target>
          <Button variant="subtle">{t`Add another destination`}</Button>
        </Menu.Target>
        <Menu.Dropdown>TEST</Menu.Dropdown>
      </Menu>
    </Stack>
  );
};
