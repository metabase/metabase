import React from "react";
import Icon from "metabase/components/Icon";
import { HoveredTimelineEvent } from "./types";
import {
  TimelineEventDate,
  TimelineEventIconContainer,
  TimelineEventInfoContainer,
  TimelineEventName,
  TimelineEventRow,
  TimelineEventsList,
} from "./TimelineEventTooltip.styled";

export interface TimelineEventTooltipProps {
  hovered: HoveredTimelineEvent;
}

const TimelineEventTooltip = (props: TimelineEventTooltipProps) => {
  const { hovered } = props;
  const { timelineEvents } = hovered;

  return (
    <TimelineEventsList>
      {timelineEvents.map(event => (
        <li key={event.id}>
          <TimelineEventRow>
            <TimelineEventIconContainer>
              <Icon name={event.icon} />
            </TimelineEventIconContainer>
            <TimelineEventInfoContainer>
              <TimelineEventName>{event.name}</TimelineEventName>
              <TimelineEventDate value={event.timestamp} />
            </TimelineEventInfoContainer>
          </TimelineEventRow>
        </li>
      ))}
    </TimelineEventsList>
  );
};

export default TimelineEventTooltip;
