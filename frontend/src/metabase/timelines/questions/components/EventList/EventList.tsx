import React, { memo } from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import { ListRoot } from "./EventList.styled";

export interface EventListProps {
  timeline: Timeline;
}

const EventList = ({ timeline }: EventListProps): JSX.Element => {
  const events = getEvents(timeline.events);

  return (
    <ListRoot>
      {events.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </ListRoot>
  );
};

const getEvents = (events: TimelineEvent[] = []) => {
  return _.chain(events)
    .filter(e => !e.archived)
    .sortBy(e => parseTimestamp(e.timestamp))
    .reverse()
    .value();
};

export default memo(EventList);
