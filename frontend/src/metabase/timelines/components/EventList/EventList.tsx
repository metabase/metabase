import React from "react";
import { t } from "ttag";
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
  return (
    <div>
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
        <ListIconContainer>
          <ListIcon name="dyno" />
          <ListIconText>{t`The Paleozoic Era`}</ListIconText>
        </ListIconContainer>
      </ListFooter>
    </div>
  );
};

export default EventList;
