import { useState } from "react";
import { match } from "ts-pattern";
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
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { MetabotConversation } from "metabase-types/api";

import {
  type MetabotProfileId,
  resolveMetabotProfileId,
} from "../../constants";

import S from "./MetabotConversationHistory.module.css";

const HISTORY_LIMIT = 25;
const SKELETON_COUNT = 5;

export const MetabotConversationHistory = ({
  profileId,
  activeConversationId,
  onConversationSelect,
}: {
  profileId: MetabotProfileId | undefined;
  activeConversationId: string | undefined;
  onConversationSelect: (conversationId: string) => void;
}) => {
  const [opened, setOpened] = useState(false);

  const { data, isFetching } = useListMetabotConversationsQuery(
    { profile_id: resolveMetabotProfileId(profileId), limit: HISTORY_LIMIT },
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
          {match({ isFetching, isEmpty: conversations.length === 0 })
            .with({ isFetching: true }, () => <HistoryLoading />)
            .with({ isFetching: false, isEmpty: true }, () => <HistoryEmpty />)
            .with({ isFetching: false, isEmpty: false }, () =>
              conversations.map((conversation) => (
                <HistoryItem
                  key={conversation.conversation_id}
                  conversation={conversation}
                  isActive={
                    conversation.conversation_id === activeConversationId
                  }
                  onSelect={onConversationSelect}
                />
              )),
            )
            .exhaustive()}
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
};

const HistoryLoading = () => (
  <Stack
    gap="sm"
    px="sm"
    py="xs"
    data-testid="metabot-conversation-history-loading"
  >
    <Repeat times={SKELETON_COUNT}>
      <Skeleton h="1.75rem" natural />
    </Repeat>
  </Stack>
);

const HistoryEmpty = () => (
  <Text c="text-secondary" px="md" py="sm" fz="sm">
    {t`No past conversations`}
  </Text>
);

const HistoryItem = ({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: MetabotConversation;
  isActive: boolean;
  onSelect: (conversationId: string) => void;
}) => (
  <Menu.Item
    aria-current={isActive || undefined}
    className={isActive ? S.activeItem : undefined}
    onClick={() => onSelect(conversation.conversation_id)}
    leftSection={<Icon c="text-secondary" name="message_circle" size={16} />}
  >
    <Flex align="center" gap="sm" wrap="nowrap">
      <Text truncate fw="bold" fz="sm" c="text-primary" flex={1}>
        {conversation.title || t`Untitled`}
      </Text>
      <Text c="text-secondary" fz="xs" style={{ flexShrink: 0 }}>
        {getRelativeTime(
          conversation.last_message_at ?? conversation.created_at,
        )}
      </Text>
    </Flex>
  </Menu.Item>
);
