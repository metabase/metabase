import React, { ChangeEvent, MouseEvent, memo, useCallback } from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import CollapseSection from "metabase/components/CollapseSection";
import { Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import {
  CardHeader,
  CardList,
  CardTitle,
  CardToggle,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
  isVisible?: boolean;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineCard = ({
  timeline,
  isVisible,
  onToggleTimeline,
}: TimelineCardProps): JSX.Element => {
  const events = getEvents(timeline.events);

  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggleTimeline?.(timeline, event.target.checked);
    },
    [timeline, onToggleTimeline],
  );

  const handleClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <CollapseSection
      header={
        <CardHeader>
          <CardToggle
            checked={isVisible}
            onChange={handleToggle}
            onClick={handleClick}
          />
          <CardTitle>{timeline.name}</CardTitle>
        </CardHeader>
      }
      fullWidth={true}
      iconVariant="up-down"
      iconPosition="right"
    >
      <CardList>
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </CardList>
    </CollapseSection>
  );
};

const getEvents = (events: TimelineEvent[] = []) => {
  return _.chain(events)
    .filter(e => !e.archived)
    .sortBy(e => parseTimestamp(e.timestamp))
    .reverse()
    .value();
};

export default memo(TimelineCard);
