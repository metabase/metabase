import React, {
  ChangeEvent,
  MouseEvent,
  memo,
  useCallback,
  useState,
  useEffect,
} from "react";
import { t } from "ttag";
import _ from "underscore";
import { Timeline, TimelineEvent } from "metabase-types/api";
import { getTimelineName } from "metabase/lib/timelines";
import Ellipsified from "metabase/core/components/Ellipsified";
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
  isDefault?: boolean;
  visibleEventIds: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
}

const TimelineCard = ({
  timeline,
  isDefault,
  visibleEventIds = [],
  selectedEventIds = [],
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onShowTimelineEvents,
  onHideTimelineEvents,
}: TimelineCardProps): JSX.Element => {
  const events = getEvents(timeline.events);
  const isEventSelected = events.some(e => selectedEventIds.includes(e.id));
  const [isExpanded, setIsExpanded] = useState(isDefault || isEventSelected);

  const anyEventVisible = events.some(event =>
    visibleEventIds.includes(event.id),
  );

  const allEventsVisible = events.every(event =>
    visibleEventIds.includes(event.id),
  );

  const handleHeaderClick = useCallback(() => {
    setIsExpanded(isExpanded => !isExpanded);
  }, []);

  const handleCheckboxClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleToggleTimeline = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      console.log("🚀", "handleToggleTimeline", { timeline });
      // onToggleTimeline?.(timeline, event.target.checked, true);
    },
    [timeline],
  );

  useEffect(() => {
    if (isEventSelected) {
      setIsExpanded(isEventSelected);
    }
  }, [isEventSelected, selectedEventIds]);

  return (
    <CardRoot>
      <CardHeader
        onClick={handleHeaderClick}
        aria-label={t`Timeline card header`}
      >
        <CardCheckbox
          checked={anyEventVisible}
          indeterminate={anyEventVisible && !allEventsVisible}
          onClick={handleCheckboxClick}
          onChange={handleToggleTimeline}
        />
        <CardLabel>
          <Ellipsified tooltipMaxWidth="100%">
            {getTimelineName(timeline)}
          </Ellipsified>
        </CardLabel>
        <CardIcon name={isExpanded ? "chevronup" : "chevrondown"} />
      </CardHeader>
      {isExpanded && (
        <CardContent>
          {events.map(event => (
            <EventCard
              key={event.id}
              event={event}
              timeline={timeline}
              isSelected={selectedEventIds.includes(event.id)}
              isVisible={visibleEventIds.includes(event.id)}
              onEdit={onEditEvent}
              onMove={onMoveEvent}
              onArchive={onArchiveEvent}
              onToggleSelected={onToggleEventSelected}
              onShowTimelineEvents={onShowTimelineEvents}
              onHideTimelineEvents={onHideTimelineEvents}
            />
          ))}
        </CardContent>
      )}
    </CardRoot>
  );
};

const getEvents = (events: TimelineEvent[] = []) => {
  return _.chain(events)
    .sortBy(e => e.timestamp)
    .reverse()
    .value();
};

export default memo(TimelineCard);
