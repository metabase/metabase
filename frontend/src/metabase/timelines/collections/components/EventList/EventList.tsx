import React, { memo } from "react";
import { t } from "ttag";
import { Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import {
  ListFooter,
  ListIcon,
  ListIconContainer,
  ListIconText,
  ListRoot,
  ListThread,
  ListThreadContainer,
} from "./EventList.styled";

export interface EventListProps {
  events: TimelineEvent[];
  timeline: Timeline;
  onArchive?: (event: TimelineEvent) => void;
  onUnarchive?: (event: TimelineEvent) => void;
}

const EventList = ({
  events,
  timeline,
  onArchive,
  onUnarchive,
}: EventListProps): JSX.Element => {
  return (
    <ListRoot>
      {events.map(event => (
        <EventCard
          key={event.id}
          event={event}
          timeline={timeline}
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
    </ListRoot>
  );
};

export default memo(EventList);
