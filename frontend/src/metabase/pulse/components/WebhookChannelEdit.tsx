import cx from "classnames";
import { t } from "ttag";

import type {
  NotificationChannel,
  Alert,
  ChannelSpec,
  User,
} from "metabase-types/api";

import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import { Button, Icon, Switch } from "metabase/ui";

import CS from "metabase/css/core/index.css";
import { useTestAlertMutation } from "metabase/api";
import { createChannel } from "metabase/lib/pulse";

export const WebhookChannelEdit = ({
  channelSpec,
  alert,
  notification,
  toggleChannel,
  user,
}: {
  channelSpec: ChannelSpec;
  alert: Alert;
  toggleChannel: (
    channel: "http",
    index: number,
    value: boolean,
    notification: NotificationChannel,
  ) => void;
  user: User;
  notification: NotificationChannel;
}) => {
  console.log(alert);

  const [testAlert] = useTestAlertMutation();

  const channelIndex = alert.channels.findIndex(
    channel =>
      channel.channel_type === "http" && channel.channel_id === notification.id,
  );
  const channel = alert.channels[channelIndex];

  return (
    <li className={CS.borderRowDivider}>
      <div className={cx(CS.flex, CS.alignCenter, CS.p3, CS.borderRowDivider)}>
        <Icon className={cx(CS.mr1, CS.textLight)} name="webhook" size={28} />

        <h2>{notification.name}</h2>
        <Switch
          className={CS.flexAlignRight}
          checked={channel?.enabled}
          onChange={val =>
            toggleChannel(
              "http",
              channelIndex,
              val.target.checked,
              notification,
            )
          }
        />
      </div>
      {channel?.enabled && channelSpec.configured ? (
        <ul className={cx(CS.bgLight, CS.px3)}>
          <li className={CS.py2}>
            <Button
              onClick={() =>
                testAlert({
                  name: notification.name,
                  channels: [
                    createChannel(channelSpec, { channel_id: notification.id }),
                  ],
                  cards: [alert.card],
                  skip_if_empty: false,
                  alert_condition: "rows",
                })
              }
            >
              Test Me
            </Button>
          </li>

          {/* {renderChannel(channel, channelSpec, channelIndex)} */}
        </ul>
      ) : channel?.enabled && !channelSpec.configured ? (
        <div className={cx(CS.p4, CS.textCentered)}>
          <h3
            className={CS.mb2}
          >{t`${channelSpec.name} needs to be set up by an administrator.`}</h3>
          <ChannelSetupMessage user={user} channels={[channelSpec.name]} />
        </div>
      ) : null}
    </li>
  );
};
