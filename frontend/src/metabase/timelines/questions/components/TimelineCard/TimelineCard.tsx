import React, {
  ChangeEvent,
  MouseEvent,
  memo,
  useCallback,
  useState,
} from "react";
import _ from "underscore";
import { parseTimestamp } from "metabase/lib/time";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import EventCard from "../EventCard";
import {
  CardHeader,
  CardContent,
  CardLabel,
  CardCheckbox,
  CardIcon,
  CardRoot,
} from "./TimelineCard.styled";

export interface TimelineCardProps {
  timeline: Timeline;
  isVisible?: boolean;
  collection: Collection;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
  onEditEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
}

const TimelineCard = ({
  timeline,
  collection,
  isVisible,
  onToggleTimeline,
  onEditEvent,
  onArchiveEvent,
}: TimelineCardProps): JSX.Element => {
  const events = getEvents(timeline.events);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleHeaderClick = useCallback(() => {
    setIsExpanded(isExpanded => !isExpanded);
  }, []);

  const handleCheckboxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggleTimeline?.(timeline, event.target.checked);
    },
    [timeline, onToggleTimeline],
  );

  const handleCheckboxClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <CardRoot>
      <CardHeader onClick={handleHeaderClick}>
        <CardCheckbox
          checked={isVisible}
          onChange={handleCheckboxChange}
          onClick={handleCheckboxClick}
        />
        <CardLabel>{timeline.name}</CardLabel>
        <CardIcon name={isExpanded ? "chevronup" : "chevrondown"} />
      </CardHeader>
      {isExpanded && (
        <CardContent>
          {events.map(event => (
            <EventCard
              key={event.id}
              event={event}
              collection={collection}
              onEdit={onEditEvent}
              onArchive={onArchiveEvent}
            />
          ))}
        </CardContent>
      )}
    </CardRoot>
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
