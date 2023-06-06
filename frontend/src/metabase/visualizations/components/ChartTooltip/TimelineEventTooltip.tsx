import { Icon, IconName } from "metabase/core/components/Icon";

import { HoveredTimelineEvent } from "./types";
import {
  TimelineEventDate,
  TimelineEventIconContainer,
  TimelineEventInfoContainer,
  TimelineEventName,
  TimelineEventRow,
  TimelineEventList,
} from "./TimelineEventTooltip.styled";

export interface TimelineEventTooltipProps {
  hovered: HoveredTimelineEvent;
}

const TimelineEventTooltip = (props: TimelineEventTooltipProps) => {
  const { hovered } = props;
  const { timelineEvents } = hovered;

  return (
    <TimelineEventList>
      {timelineEvents.map(event => (
        <li key={event.id}>
          <TimelineEventRow>
            <TimelineEventIconContainer>
              <Icon name={event.icon as unknown as IconName} />
            </TimelineEventIconContainer>
            <TimelineEventInfoContainer>
              <TimelineEventName>{event.name}</TimelineEventName>
              <TimelineEventDate
                value={event.timestamp}
                unit={event.time_matters ? "default" : "day"}
              />
            </TimelineEventInfoContainer>
          </TimelineEventRow>
        </li>
      ))}
    </TimelineEventList>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineEventTooltip;
