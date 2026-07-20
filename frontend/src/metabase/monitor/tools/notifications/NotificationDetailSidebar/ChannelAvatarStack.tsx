import { match } from "ts-pattern";
import _ from "underscore";

import { Box, Flex, Icon } from "metabase/ui";
import type { NotificationHandler } from "metabase-types/api";

import { getChannelIconName } from "../NotificationsAdminPage/utils";

import S from "./NotificationDetailSidebar.module.css";
import type { ChannelAvatarProps } from "./types";

const AVATAR_SIZE = 36;

export const ChannelAvatarStack = ({
  handlers,
}: {
  handlers: NotificationHandler[] | undefined;
}) => {
  const channels = _.uniq(
    handlers?.map((handler) => handler.channel_type) ?? [],
  );

  return (
    <Flex align="center" className={S.avatarStack}>
      {channels.map((channel, index) => (
        <Box
          key={channel}
          style={{
            marginLeft: index === 0 ? 0 : -AVATAR_SIZE / 2,
            zIndex: channels.length - index,
          }}
        >
          <ChannelAvatar channel={channel} bordered={channels.length > 1} />
        </Box>
      ))}
    </Flex>
  );
};

const ChannelAvatar = ({ channel, bordered }: ChannelAvatarProps) => {
  const { backgroundColor, iconColor } = match(channel)
    .with("channel/slack", () => ({
      backgroundColor:
        "color-mix(in srgb, var(--mb-color-core-purple-saturated) 10%, var(--mb-color-background_page-primary))",
      iconColor: "core-purple-saturated" as const,
    }))
    .otherwise(() => ({
      backgroundColor: "var(--mb-color-background_surface-brand-subtle)",
      iconColor: "core-brand" as const,
    }));

  return (
    <Flex
      align="center"
      justify="center"
      w={AVATAR_SIZE}
      h={AVATAR_SIZE}
      bd={
        bordered
          ? "2px solid var(--mb-color-background_page-primary)"
          : undefined
      }
      bdrs="50%"
      className={S.channelAvatar}
      style={{ backgroundColor }}
    >
      <Icon
        name={channel ? getChannelIconName(channel) : "bell"}
        c={iconColor}
      />
    </Flex>
  );
};
