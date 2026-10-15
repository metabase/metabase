import { memo } from "react";
import { t } from "ttag";

import { Box, Flex, Icon, Stack, Text } from "metabase/ui";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import EventCard from "../EventCard";

import S from "./EventList.module.css";

export interface EventListProps {
  events: TimelineEvent[];
  timeline: Timeline;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const EventList = ({
  events,
  timeline,
  onArchive,
  onUnarchive,
}: EventListProps): JSX.Element => {
  return (
    <Flex direction="column" flex="1 1 auto" data-testid="event-list">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          timeline={timeline}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
        />
      ))}
      <Stack gap="sm" flex="1 1 auto" mt="sm">
        <Flex justify="center" flex="1 1 auto" w="xxl" h="xxl">
          <Box className={S.thread} />
        </Flex>
        <Flex gap="md" ml="md">
          <Icon name="dyno" c="text-disabled" size={24} />
          <Text c="text-disabled" mt="xs" lh="normal">
            {t`The Mesozoic era`}
          </Text>
        </Flex>
      </Stack>
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(EventList);
