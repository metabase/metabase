import { useEffect, useId, useRef } from "react";
import { t } from "ttag";

import { ToolCallDetailsContent } from "metabase/metabot/components/MetabotChat/MetabotAgentToolCallPart";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state";
import { ActionIcon, Badge, Flex, Icon, Stack, Text } from "metabase/ui";
import { formatDurationLong } from "metabase/utils/formatting/duration";
import type { ToolCallTiming } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/types";

import S from "./ToolCallDetailsSidebar.module.css";

type ToolCallDetailsSidebarProps = {
  message: MetabotDebugToolCallMessage;
  timing?: ToolCallTiming;
  onClose: () => void;
};

function getTimingLabel(timing: ToolCallTiming): string | null {
  if (timing.status === "skipped") {
    return t`Skipped`;
  }
  if (timing.duration_ms == null) {
    return timing.status === "aborted" ? t`Aborted` : null;
  }
  const duration = formatDurationLong(timing.duration_ms);
  if (timing.wait_ms == null) {
    return t`Ran for ${duration}`;
  }
  const wait = formatDurationLong(timing.wait_ms);
  return t`Waited ${wait} · Ran for ${duration}`;
}

export function ToolCallDetailsSidebar({
  message,
  timing,
  onClose,
}: ToolCallDetailsSidebarProps) {
  const headingId = useId();
  const timingLabel = timing ? getTimingLabel(timing) : null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the newly-opened panel
  // so keyboard/screen-reader users land on the details.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [message.id]);

  return (
    <Stack
      className={S.sidebar}
      p="xl"
      gap="xl"
      bg="background_page-primary"
      data-testid="tool-call-details-sidebar"
      role="region"
      aria-labelledby={headingId}
    >
      <Stack gap="xxs">
        <Flex align="center" justify="space-between" gap="lg" wrap="nowrap">
          <Text id={headingId} fw="bold">{t`Tool Call`}</Text>
          <ActionIcon
            variant="subtle"
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
        {timingLabel && (
          <Text size="sm" c="text-secondary" data-testid="tool-call-timing">
            {timingLabel}
          </Text>
        )}
      </Stack>
      <ToolCallDetailsContent message={message} />
    </Stack>
  );
}
