import { DateTime } from "metabase/common/components/DateTime";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import type { HoveredTimelineEvent } from "metabase/visualizations/types";

import S from "./TimelineEventTooltip.module.css";

export interface TimelineEventTooltipProps {
  hovered: HoveredTimelineEvent;
}

const TimelineEventTooltip = (props: TimelineEventTooltipProps) => {
  const { hovered } = props;
  const { timelineEvents } = hovered;

  return (
    <ul className={S.timelineEventList}>
      {timelineEvents.map((event) => (
        <li key={event.id}>
          <Flex>
            <Flex justify="center" align="center" pl="xs" pr="0.75rem">
              <Icon name={event.icon as unknown as IconName} />
            </Flex>
            <Stack gap={0}>
              <Text component="span" fz="md" fw="bold">
                {event.name}
              </Text>
              <DateTime
                className={S.timelineEventDate}
                value={event.timestamp}
                unit={event.time_matters ? "default" : "day"}
              />
            </Stack>
          </Flex>
        </li>
      ))}
    </ul>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEventTooltip;
