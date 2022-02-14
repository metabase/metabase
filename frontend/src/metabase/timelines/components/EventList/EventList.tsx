import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import {
  ListFooter,
  ListIcon,
  ListIconContainer,
  ListIconText,
  ListThread,
  ListThreadContainer,
} from "./EventList.styled";

export interface EventListProps {
  events: TimelineEvent[];
  timeline: Timeline;
  collection: Collection;
}

const EventList = ({
  events,
  timeline,
  collection,
}: EventListProps): JSX.Element => {
  const sortedEvents = useMemo(
    () => _.sortBy(events, e => parseTimestamp(e.timestamp)).reverse(),
    [events],
  );

  return (
    <div>
      {sortedEvents.map(event => (
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
        <ListIconContainer>
          <ListIcon name="dyno" />
          <ListIconText>{t`The Paleozoic Era`}</ListIconText>
        </ListIconContainer>
      </ListFooter>
    </div>
  );
};

export default EventList;
