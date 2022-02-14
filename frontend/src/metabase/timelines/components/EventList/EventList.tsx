import React, { useMemo } from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { Collection, Timeline } from "metabase-types/api";
import EventCard from "../EventCard";
import {
  ListFooter,
  ListRoot,
  ListThread,
  ListThreadContainer,
} from "./EventList.styled";

export interface EventListProps {
  timeline: Timeline;
  collection: Collection;
}

const EventList = ({ timeline, collection }: EventListProps): JSX.Element => {
  const events = useMemo(
    () => _.sortBy(timeline.events, e => parseTimestamp(e.timestamp)).reverse(),
    [timeline],
  );

  return (
    <ListRoot>
      {events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          timeline={timeline}
          collection={collection}
        />
      ))}
      <ListFooter>
        <ListThreadContainer>
          <ListThread />
        </ListThreadContainer>
      </ListFooter>
    </ListRoot>
  );
};

export default EventList;
