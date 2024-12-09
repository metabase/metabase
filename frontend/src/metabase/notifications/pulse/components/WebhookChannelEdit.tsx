import cx from "classnames";
import { t } from "ttag";

import { useTestAlertMutation } from "metabase/api";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { useActionButtonLabel } from "metabase/hooks/use-action-button-label";
import { createChannel } from "metabase/lib/pulse";
import { Box, Button, Flex, Icon, Switch, Text } from "metabase/ui";
import type {
  Alert,
  ChannelSpec,
  NotificationChannel,
} from "metabase-types/api";

export const WebhookChannelEdit = ({
  channelSpec,
  alert,
  notification,
  toggleChannel,
}: {
  channelSpec: ChannelSpec;
  alert: Alert;
  toggleChannel: (
    channel: "http",
    index: number,
    value: boolean,
    notification: NotificationChannel,
  ) => void;
  notification: NotificationChannel;
}) => {
  const [testAlert, testAlertRequest] = useTestAlertMutation();
  const { label, setLabel } = useActionButtonLabel({
    defaultLabel: t`Send a test`,
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
        setLabel(t`Success!`);
      })
      .catch(() => {
        setLabel(t`Something went wrong`);
      });
  };

  return (
    <li className={CS.borderRowDivider} aria-label={notification.name}>
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
            <Flex justify="space-between" gap="5rem" align="center">
              <Text style={{ flexBasis: 0, flexGrow: 1 }}>
                <Ellipsified lines={2} multiline tooltipMaxWidth={350}>
                  {notification.description}
                </Ellipsified>
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
        </ul>
      ) : null}
    </li>
  );
};
