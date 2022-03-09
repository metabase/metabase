import React, { memo } from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import { ListRoot } from "./EventList.styled";

export interface EventListProps {
  events?: TimelineEvent[];
}

const EventList = ({ events }: EventListProps): JSX.Element => {
  const sortedEvents = getSortedEvents(events);

  return (
    <ListRoot>
      {sortedEvents.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </ListRoot>
  );
};

const getSortedEvents = (events: TimelineEvent[] = []) => {
  return _.chain(events)
    .filter(e => !e.archived)
    .sortBy(e => parseTimestamp(e.timestamp))
    .reverse()
    .value();
};

export default memo(EventList);
