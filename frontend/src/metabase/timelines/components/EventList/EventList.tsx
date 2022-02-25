import React, { memo } from "react";
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
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const EventList = ({
  events,
  timeline,
  collection,
  onArchive,
  onUnarchive,
}: EventListProps): JSX.Element => {
  return (
    <div>
      {events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          timeline={timeline}
          collection={collection}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
        />
      ))}
      <ListFooter>
        <ListThreadContainer>
          <ListThread />
        </ListThreadContainer>
        <ListIconContainer>
          <ListIcon name="dyno" />
          <ListIconText>{t`The Mesozoic era`}</ListIconText>
        </ListIconContainer>
      </ListFooter>
    </div>
  );
};

export default memo(EventList);
