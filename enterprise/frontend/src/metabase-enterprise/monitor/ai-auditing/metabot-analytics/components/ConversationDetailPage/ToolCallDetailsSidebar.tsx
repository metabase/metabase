import { t } from "ttag";

import { ToolCallDetailsContent } from "metabase/metabot/components/MetabotChat/MetabotAgentToolCallMessage";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state";
import { ActionIcon, Badge, Flex, Icon, Stack, Text } from "metabase/ui";

import S from "./ToolCallDetailsSidebar.module.css";

type ToolCallDetailsSidebarProps = {
  message: MetabotDebugToolCallMessage;
  onClose: () => void;
};

export function ToolCallDetailsSidebar({
  message,
  onClose,
}: ToolCallDetailsSidebarProps) {
  return (
    <Stack
      className={S.sidebar}
      p="lg"
      gap="lg"
      bg="background_page-primary"
      data-testid="tool-call-details-sidebar"
    >
      <Stack gap="xs">
        <Flex align="center" justify="space-between" gap="md" wrap="nowrap">
          <Text fw="bold">{t`Tool Call`}</Text>
          <ActionIcon aria-label={t`Close`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </Flex>
        <Flex align="center" gap="sm">
          <Text c="text-secondary">{message.name}</Text>
          <Badge color="brand" size="sm" variant="light">
            {message.id}
          </Badge>
        </Flex>
      </Stack>
      <ToolCallDetailsContent message={message} boxed />
    </Stack>
  );
}
