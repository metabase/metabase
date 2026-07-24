import { useEffect, useId, useRef } from "react";
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
  const headingId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the newly-opened panel (and again when a different tool call
  // is selected) so keyboard/screen-reader users land on the details.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [message.id]);

  return (
    <Stack
      className={S.sidebar}
      p="lg"
      gap="lg"
      bg="background_page-primary"
      data-testid="tool-call-details-sidebar"
      role="region"
      aria-labelledby={headingId}
    >
      <Stack gap="xs">
        <Flex align="center" justify="space-between" gap="md" wrap="nowrap">
          <Text id={headingId} fw="bold">{t`Tool Call`}</Text>
          <ActionIcon
            ref={closeButtonRef}
            aria-label={t`Close`}
            onClick={onClose}
          >
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
