import { DateTime } from "metabase/common/components/DateTime";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

import S from "./TimelineEventsBand.module.css";
import { TIMELINE_ICON_TO_ICON_NAME } from "./utils";

interface TimelineEventsListProps {
  events: TimelineEvent[];
}

export const TimelineEventsList = ({ events }: TimelineEventsListProps) => (
  <Stack className={S.eventList} gap="sm" data-testid="timeline-events-list">
    {events.map((event) => (
      <Flex key={event.id} gap="sm" align="flex-start">
        <Icon
          name={TIMELINE_ICON_TO_ICON_NAME[event.icon]}
          c="text-secondary"
          mt="0.125rem"
        />
        <Stack gap={0}>
          <Text component="span" c="inherit" fz="md" fw="bold">
            {event.name}
          </Text>
          <DateTime
            className={S.eventDate}
            value={event.timestamp}
            unit={event.time_matters ? "default" : "day"}
          />
        </Stack>
      </Flex>
    ))}
  </Stack>
);
