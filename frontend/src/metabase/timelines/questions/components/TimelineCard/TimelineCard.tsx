import React, { memo } from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import CheckBox from "metabase/core/components/CheckBox";
import CollapseSection from "metabase/components/CollapseSection";
import { Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import { CardBody, CardHeader, CardTitle } from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
}

const TimelineCard = ({ timeline }: TimelineCardProps): JSX.Element => {
  const events = getEvents(timeline.events);

  return (
    <CollapseSection
      header={
        <CardHeader>
          <CheckBox checked={true} />
          <CardTitle>{timeline.name}</CardTitle>
        </CardHeader>
      }
      fullWidth={true}
      iconVariant="up-down"
      iconPosition="right"
    >
      <CardBody>
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </CardBody>
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
