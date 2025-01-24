import { useMemo } from "react";
import { t } from "ttag";

import Link from "metabase/core/components/Link/Link";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { Button, Group, Icon, type IconName, Menu, Text } from "metabase/ui";
import type {
  ChannelApiResponse,
  NotificationChannel,
  NotificationHandler,
} from "metabase-types/api";

export type ChannelToAddOption =
  | {
      type: "channel/email" | "channel/slack";
    }
  | {
      type: "channel/http";
      name: string;
      channel_id: number;
    };

type NotificationChannelsAddMenuProps = {
  notificationHandlers: NotificationHandler[];
  channelsSpec: ChannelApiResponse["channels"];
  notificationChannels: NotificationChannel[];
  isAdmin: boolean;
  onAddChannel: (channel: ChannelToAddOption) => void;
};

export const NotificationChannelsAddMenu = ({
  notificationHandlers,
  channelsSpec,
  notificationChannels,
  isAdmin,
  onAddChannel,
}: NotificationChannelsAddMenuProps) => {
  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notificationHandlers);

  const notAddedHookChannels = useMemo(() => {
    if (!channelsSpec.http?.configured || !isAdmin) {
      return [];
    }

    const addedHooksMap = (hookHandlers || []).reduce(
      (result, item) => {
        result[item.channel_id] = true;
        return result;
      },
      {} as { [key: number]: true },
    );

    return notificationChannels.filter(({ id }) => !addedHooksMap[id]);
  }, [
    channelsSpec.http?.configured,
    hookHandlers,
    isAdmin,
    notificationChannels,
  ]);

  const hasAddedEmail = channelsSpec.email?.configured && !!emailHandler;
  const hasAddedSlack = channelsSpec.slack?.configured && !!slackHandler;
  const hasChannelsToAdd =
    !hasAddedEmail || !hasAddedSlack || notAddedHookChannels.length > 0;
  const hasAddedNoChannels = !notificationHandlers.length;

  if (!isAdmin && !hasChannelsToAdd) {
    return null;
  }

  if (isAdmin && !hasChannelsToAdd) {
    return (
      <Button
        variant="subtle"
        component={Link}
        to="/admin/settings/notifications"
        target="_blank"
      >{t`Manage destination channels`}</Button>
    );
  }

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button variant="subtle">
          {hasAddedNoChannels
            ? t`Add a destination`
            : t`Add another destination`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {channelsSpec.email?.configured && !emailHandler && (
          <Menu.Item onClick={() => onAddChannel({ type: "channel/email" })}>
            <ChannelMenuItemContent name={t`Email`} icon="mail" />
          </Menu.Item>
        )}

        {channelsSpec.slack?.configured && !slackHandler && (
          <Menu.Item onClick={() => onAddChannel({ type: "channel/slack" })}>
            <ChannelMenuItemContent name={t`Slack`} icon="int" />
          </Menu.Item>
        )}

        {notAddedHookChannels.length > 0 && (
          <>
            <Menu.Label mt="1rem">{t`Webhooks`}</Menu.Label>
            {notAddedHookChannels.map(channel => (
              <Menu.Item
                key={channel.id}
                onClick={() =>
                  onAddChannel({
                    type: "channel/http",
                    channel_id: channel.id,
                    name: channel.name,
                  })
                }
              >
                <ChannelMenuItemContent name={channel.name} icon="webhook" />
              </Menu.Item>
            ))}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

const ChannelMenuItemContent = ({
  name,
  icon,
}: {
  name: string;
  icon: IconName;
}) => (
  <Group spacing="md" align="center">
    <Icon name={icon} />
    <Text>{name}</Text>
  </Group>
);
