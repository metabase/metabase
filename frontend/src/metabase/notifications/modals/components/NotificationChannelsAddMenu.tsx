import { useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import CS from "metabase/css/core/index.css";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { Button, Menu, Text } from "metabase/ui";
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
  httpChannelsConfig: NotificationChannel[];
  userCanAccessSettings: boolean;
  onAddChannel: (channel: ChannelToAddOption) => void;
};

export const NotificationChannelsAddMenu = ({
  notificationHandlers,
  channelsSpec,
  httpChannelsConfig,
  userCanAccessSettings,
  onAddChannel,
}: NotificationChannelsAddMenuProps) => {
  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notificationHandlers);

  const notAddedHookChannels = useMemo(() => {
    if (!channelsSpec.http?.configured || !userCanAccessSettings) {
      return [];
    }

    const addedHooksMap = (hookHandlers || []).reduce(
      (result, item) => {
        result[item.channel_id] = true;
        return result;
      },
      {} as { [key: number]: true },
    );

    return httpChannelsConfig.filter(({ id }) => !addedHooksMap[id]);
  }, [
    channelsSpec.http?.configured,
    hookHandlers,
    userCanAccessSettings,
    httpChannelsConfig,
  ]);

  const hasAddedEmail = channelsSpec.email?.configured && !!emailHandler;
  const hasAddedSlack = channelsSpec.slack?.configured && !!slackHandler;
  const canAddEmail = channelsSpec.email?.configured && !emailHandler;
  const canAddSlack = channelsSpec.slack?.configured && !slackHandler;
  const hasChannelsToAdd =
    canAddEmail || canAddSlack || notAddedHookChannels.length > 0;
  const hasAddedNoChannels = !notificationHandlers.length;

  if (!userCanAccessSettings && !hasChannelsToAdd) {
    return null;
  }

  if (userCanAccessSettings && !hasChannelsToAdd) {
    return <ManageDestinationsButton />;
  }

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button variant="subtle" p={0} mt="-0.75rem" mb="-0.75rem">
          {hasAddedNoChannels
            ? t`Add a destination`
            : t`Add another destination`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {channelsSpec.email?.configured && !emailHandler && (
          <Menu.Item onClick={() => onAddChannel({ type: "channel/email" })}>
            <Text className={CS.textList}>{t`Email`}</Text>
          </Menu.Item>
        )}

        {channelsSpec.slack?.configured && !slackHandler && (
          <Menu.Item onClick={() => onAddChannel({ type: "channel/slack" })}>
            <Text className={CS.textList}>{t`Slack`}</Text>
          </Menu.Item>
        )}

        {notAddedHookChannels.length > 0 && (
          <>
            <Menu.Label
              mt={!hasAddedEmail || !hasAddedSlack ? "1rem" : undefined}
              c="text-secondary"
            >{t`Webhooks`}</Menu.Label>
            {notAddedHookChannels.map((channel) => (
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
                <Text className={CS.textList}>{channel.name}</Text>
              </Menu.Item>
            ))}
          </>
        )}

        {userCanAccessSettings && (
          <Button
            variant="subtle"
            size="xs"
            component={Link}
            to="/admin/settings/notifications"
            target="_blank"
            pl="sm"
          >
            <Text size="sm" c="inherit">{t`Manage destination channels`}</Text>
          </Button>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

const ManageDestinationsButton = () => (
  <Button
    variant="subtle"
    p={0}
    mt="-0.75rem"
    mb="-0.75rem"
    component={Link}
    to="/admin/settings/notifications"
    target="_blank"
  >{t`Manage destination channels`}</Button>
);
