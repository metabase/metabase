import { t } from "ttag";

import { ActionIcon, Group, Icon, ScrollArea, Stack, Text } from "metabase/ui";
import { TimelineEventsList } from "metabase/visualizations/visualizations/CartesianChart/TimelineEventsBand/TimelineEventsList";
import type { TimelineEvent } from "metabase-types/api";

import S from "./TimelineEventsSidebar.module.css";

interface TimelineEventsSidebarProps {
  events: TimelineEvent[];
  onClose: () => void;
}

export function TimelineEventsSidebar({
  events,
  onClose,
}: TimelineEventsSidebarProps) {
  return (
    <Stack
      w="23rem"
      h="100%"
      gap={0}
      className={S.sidebar}
      data-testid="exploration-timeline-events-sidebar"
    >
      <Group
        justify="space-between"
        align="center"
        px="lg"
        py="md"
        wrap="nowrap"
      >
        <Text fw="bold">{t`${events.length} events`}</Text>
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <ScrollArea flex={1} px="lg" pb="lg">
        <TimelineEventsList events={events} />
      </ScrollArea>
    </Stack>
  );
}
