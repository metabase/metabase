import cx from "classnames";
import { t } from "ttag";

import { useTestAlertMutation } from "metabase/api";
import ChannelSetupMessage from "metabase/components/ChannelSetupMessage";
import CS from "metabase/css/core/index.css";
import { useActionButtonLabel } from "metabase/hooks/use-action-button-label";
import { createChannel } from "metabase/lib/pulse";
import { Button, Icon, Switch, Flex, Text, Box } from "metabase/ui";
import type {
  NotificationChannel,
  Alert,
  ChannelSpec,
  User,
} from "metabase-types/api";

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
  const [testAlert, testAlertRequest] = useTestAlertMutation();
  const { label, setLabel } = useActionButtonLabel({
    defaultLabel: t`Sent a test`,
  });

  const channelIndex = alert.channels.findIndex(
    channel =>
      channel.channel_type === "http" && channel.channel_id === notification.id,
  );
  const channel = alert.channels[channelIndex];

  const handleTest = async () => {
    await testAlert({
      name: notification.name,
      channels: [
        createChannel(channelSpec, {
          channel_id: notification.id,
        }),
      ],
      cards: [alert.card],
      skip_if_empty: false,
      alert_condition: "rows",
    })
      .unwrap()
      .then(() => {
        setLabel(t`Succes`);
      })
      .catch(() => {
        setLabel(t`Something went wrong`);
      });
  };

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
          <li className={CS.py3}>
            <Flex justify="space-between" gap="5rem">
              <Text style={{ flexBasis: 0, flexGrow: 1 }}>
                {notification.description}
              </Text>
              <Box>
                <Button
                  onClick={handleTest}
                  disabled={testAlertRequest?.isLoading}
                >
                  {label}
                </Button>
              </Box>
            </Flex>
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
