import React from "react";
import Icon from "metabase/components/Icon";
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
              <Icon name={event.icon} />
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

export default TimelineEventTooltip;
