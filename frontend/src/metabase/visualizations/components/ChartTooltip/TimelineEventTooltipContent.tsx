import React from "react";
import Icon from "metabase/components/Icon";
import { HoveredTimelineEvent } from "./types";
import {
  TimelineEventRow,
  TimelineEventIconContainer,
  TimelineEventInfoContainer,
  TimelineEventName,
  TimelineEventDate,
} from "./ChartTooltip.styled";

type TimelineEventTooltipContentProps = {
  hovered: HoveredTimelineEvent;
};

function TimelineEventTooltipContent({
  hovered,
}: TimelineEventTooltipContentProps) {
  const { timelineEvent } = hovered;
  return (
    <TimelineEventRow>
      <TimelineEventIconContainer>
        <Icon name={timelineEvent.icon} />
      </TimelineEventIconContainer>
      <TimelineEventInfoContainer>
        <TimelineEventName>{timelineEvent.name}</TimelineEventName>
        <TimelineEventDate value={timelineEvent.timestamp} />
      </TimelineEventInfoContainer>
    </TimelineEventRow>
  );
}

export default TimelineEventTooltipContent;
