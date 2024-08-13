import type { ChangeEvent, MouseEvent } from "react";
import { memo, useCallback, useMemo, useState, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { getTimelineName } from "metabase/lib/timelines";
import type { Timeline, TimelineEvent } from "metabase-types/api";

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

  const anyEventVisible = useMemo(
    () => events.some(event => visibleEventIds.includes(event.id)),
    [events, visibleEventIds],
  );

  const allEventsVisible = useMemo(
    () => events.every(event => visibleEventIds.includes(event.id)),
    [events, visibleEventIds],
  );

  const handleHeaderClick = useCallback(() => {
    setIsExpanded(isExpanded => !isExpanded);
  }, []);

  const handleCheckboxClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleChangeVisibility = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
        timeline.events && onShowTimelineEvents(timeline.events);
      } else {
        timeline.events && onHideTimelineEvents(timeline.events);
      }
    },
    [timeline, onShowTimelineEvents, onHideTimelineEvents],
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
          onChange={handleChangeVisibility}
        />
        <CardLabel>
          <Ellipsified tooltipMaxWidth="auto">
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(TimelineCard);
