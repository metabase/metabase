import { DateTime } from "metabase/common/components/DateTime";
import { Box, Flex, Icon, Stack, Text } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

import S from "./TimelineEventsBand.module.css";
import { TIMELINE_ICON_TO_SMALL_ICON_MAP } from "./utils";

interface TimelineEventRowProps {
  event: TimelineEvent;
  showIcon?: boolean;
}

export const TimelineEventRow = ({
  event,
  showIcon = true,
}: TimelineEventRowProps) => (
  <Flex gap="sm" align="flex-start">
    {showIcon && (
      <Icon
        name={TIMELINE_ICON_TO_SMALL_ICON_MAP[event.icon]}
        c="icon-disabled"
        mt="0.125rem"
        size={12}
        flex="0 0 auto"
      />
    )}
    <Stack gap={2}>
      <Text component="span" c="text-primary" size="sm" lh="1rem" fw="bold">
        {event.name}
      </Text>
      <DateTime
        className={S.eventDate}
        value={event.timestamp}
        unit={event.time_matters ? "default" : "day"}
      />
    </Stack>
  </Flex>
);

interface TimelineEventsListProps {
  events: TimelineEvent[];
}

export const TimelineEventsList = ({ events }: TimelineEventsListProps) => (
  <Stack gap={0} data-testid="timeline-events-list">
    {events.map((event) => (
      <Box key={event.id} className={S.listItemWrapper}>
        <TimelineEventRow event={event} />
      </Box>
    ))}
  </Stack>
);
