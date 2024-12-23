import cx from "classnames";
import { assoc, updateIn } from "icepick";
import { t } from "ttag";

import { useListChannelsQuery } from "metabase/api/channel";
import CS from "metabase/css/core/index.css";
import { createChannel } from "metabase/lib/pulse";
import type {
  Alert,
  Channel,
  ChannelApiResponse,
  ChannelType,
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
  alert: Alert;
  channels: ChannelApiResponse["channels"] | undefined;
  users: User[];
  setPulse: (value: Alert) => void;
  emailRecipientText: string;
  invalidRecipientText: (domains: string) => string;
  isAdminUser: boolean;
}

export const NotificationChannelsPicker = ({
  alert,
  channels: nullableChannels,
  users,
  setPulse,
  invalidRecipientText,
  isAdminUser,
}: NotificationChannelsPickerProps) => {
  const { data: notificationChannels = [] } = useListChannelsQuery();

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

    setPulse({ ...alert, channels: alert.channels.concat(channel) });
  };

  const onChannelPropertyChange = (index: number, name: string, value: any) => {
    const channels = [...alert.channels];

    channels[index] = { ...channels[index], [name]: value };

    setPulse({ ...alert, channels });
  };

  const toggleChannel = (
    type: ChannelType,
    index: number,
    enable: boolean,
    notification?: NotificationChannel,
  ) => {
    if (enable) {
      if (alert.channels[index]) {
        setPulse(
          updateIn(alert, ["channels", index], (channel: Channel) =>
            assoc(channel, "enabled", true),
          ),
        );
      } else {
        addChannel(type, notification);
      }
    } else {
      const channel = alert.channels[index];

      const shouldRemoveChannel =
        type === "email" && channel?.recipients?.length === 0;

      const updatedPulse = shouldRemoveChannel
        ? updateIn(alert, ["channels"], channels =>
            channels.toSpliced(index, 1),
          )
        : updateIn(alert, ["channels", index], (channel: Channel) =>
            assoc(channel, "enabled", false),
          );
      setPulse(updatedPulse);
    }
  };

  // Default to show the default channels until full formInput is loaded
  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  return (
    <ul className={cx(CS.bordered, CS.rounded, CS.bgWhite)}>
      <EmailChannelEdit
        isAdminUser={isAdminUser}
        users={users}
        toggleChannel={toggleChannel}
        onChannelPropertyChange={onChannelPropertyChange}
        channelSpec={channels.email}
        alert={alert}
        invalidRecipientText={invalidRecipientText}
      />
      {channels.slack.configured && (
        <SlackChannelEdit
          isAdminUser={isAdminUser}
          toggleChannel={toggleChannel}
          onChannelPropertyChange={onChannelPropertyChange}
          channelSpec={channels.slack}
          alert={alert}
        />
      )}
      {isAdminUser &&
        notificationChannels.map(notification => (
          <WebhookChannelEdit
            key={`webhook-${notification.id}`}
            toggleChannel={toggleChannel}
            channelSpec={channels.http}
            alert={alert}
            notification={notification}
          />
        ))}
    </ul>
  );
};
