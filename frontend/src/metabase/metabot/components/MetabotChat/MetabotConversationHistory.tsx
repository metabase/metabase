import dayjs from "dayjs";
import { useState } from "react";
import { t } from "ttag";

import { useListMetabotConversationsQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Menu,
  Repeat,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import type { MetabotProfileId } from "../../constants";

const HISTORY_LIMIT = 25;

const formatTimestamp = (timestamp: string) => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const minutes = now.diff(date, "minute");
  const hours = now.diff(date, "hour");
  const days = now.diff(date, "day");

  if (minutes < 1) {
    return t`now`;
  }
  if (minutes < 60) {
    return t`${minutes}m ago`;
  }
  if (hours < 24) {
    return t`${hours}h ago`;
  }
  if (days < 7) {
    return t`${days}d ago`;
  }
  return date.format(date.year() === now.year() ? "MMM D" : "MMM D, YYYY");
};

export const MetabotConversationHistory = ({
  profileId,
}: {
  profileId: MetabotProfileId | undefined;
}) => {
  const [opened, setOpened] = useState(false);

  const { data, isFetching } = useListMetabotConversationsQuery(
    { profile_id: profileId ?? null, limit: HISTORY_LIMIT },
    { skip: !opened, refetchOnMountOrArgChange: true },
  );

  const conversations = data?.data ?? [];

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      width={320}
    >
      <Menu.Target>
        <Tooltip label={t`Recent conversations`} position="bottom">
          <ActionIcon
            aria-label={t`Recent conversations`}
            data-testid="metabot-conversation-history"
          >
            <Icon c="text-primary" name="history" size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Box
          mah="20rem"
          style={{ overflowY: "auto" }}
          data-testid="metabot-conversation-history-list"
        >
          <Menu.Label>{t`Recent conversations`}</Menu.Label>
          {isFetching ? (
            <Stack
              gap="sm"
              px="sm"
              py="xs"
              data-testid="metabot-conversation-history-loading"
            >
              <Repeat times={5}>
                <Skeleton h="1.75rem" natural />
              </Repeat>
            </Stack>
          ) : conversations.length === 0 ? (
            <Text c="text-secondary" px="md" py="sm" fz="sm">
              {t`No past conversations`}
            </Text>
          ) : (
            conversations.map((conversation) => (
              <Menu.Item
                key={conversation.conversation_id}
                leftSection={
                  <Icon c="text-secondary" name="message_circle" size={16} />
                }
              >
                <Flex align="center" gap="sm" wrap="nowrap">
                  <Text truncate fw="bold" fz="sm" c="text-primary" flex={1}>
                    {conversation.title || t`Untitled`}
                  </Text>
                  <Text c="text-secondary" fz="xs" style={{ flexShrink: 0 }}>
                    {formatTimestamp(
                      conversation.last_message_at ?? conversation.created_at,
                    )}
                  </Text>
                </Flex>
              </Menu.Item>
            ))
          )}
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
};
