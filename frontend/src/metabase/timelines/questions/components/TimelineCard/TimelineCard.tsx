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
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";
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
  isVisible?: boolean;
  visibleEventIds: number[];
  selectedEventIds?: number[];
  onEditEvent?: (event: TimelineEvent) => void;
  onMoveEvent?: (event: TimelineEvent) => void;
  onArchiveEvent?: (event: TimelineEvent) => void;
  onToggleEventSelected?: (event: TimelineEvent, isSelected: boolean) => void;
  onToggleEventVisibility: (event: TimelineEvent, isSelected: boolean) => void;
  onToggleTimeline?: (timeline: Timeline, isVisible: boolean) => void;
}

const TimelineCard = ({
  timeline,
  isDefault,
  isVisible,
  visibleEventIds = [],
  selectedEventIds = [],
  onEditEvent,
  onMoveEvent,
  onArchiveEvent,
  onToggleEventSelected,
  onToggleEventVisibility,
  onToggleTimeline,
}: TimelineCardProps): JSX.Element => {
  const events = getEvents(timeline.events);
  const isEventSelected = events.some(e => selectedEventIds.includes(e.id));
  const [isExpanded, setIsExpanded] = useState(isDefault || isEventSelected);
  const allEventsVisible = events.every(event =>
    visibleEventIds.includes(event.id),
  );

  const handleHeaderClick = useCallback(() => {
    setIsExpanded(isExpanded => !isExpanded);
  }, []);

  const handleCheckboxClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onToggleTimeline?.(timeline, !isVisible);
    },
    [timeline, isVisible, onToggleTimeline],
  );

  const handleToggleTimeline = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggleTimeline?.(timeline, event.target.checked);
    },
    [timeline, onToggleTimeline],
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
        <IconButtonWrapper
          onClick={handleCheckboxClick}
          style={{ opacity: isVisible ? 0.6 : 0.3 }}
        >
          <Icon name={isVisible ? "eye_outline" : "eye_crossed_out"} />
        </IconButtonWrapper>

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
              isVisible={!!isVisible && visibleEventIds.includes(event.id)}
              isTimelineVisible={isVisible}
              onEdit={onEditEvent}
              onMove={onMoveEvent}
              onArchive={onArchiveEvent}
              onToggleSelected={onToggleEventSelected}
              onToggleEventVisibility={onToggleEventVisibility}
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
