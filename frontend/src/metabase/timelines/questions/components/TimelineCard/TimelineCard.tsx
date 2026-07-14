import type { ChangeEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getTimelineName } from "metabase/common/utils/timelines";
import { Box, Checkbox, Ellipsified, Flex, Icon } from "metabase/ui";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import EventCard from "../EventCard";

import S from "./TimelineCard.module.css";

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

const TimelineCardInner = ({
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
  const isEventSelected = events.some((e) => selectedEventIds.includes(e.id));
  const hasSelection = selectedEventIds.length > 0;
  const prevHasSelectionRef = useRef(hasSelection);
  const [isExpanded, setIsExpanded] = useState(
    hasSelection ? isEventSelected : Boolean(isDefault),
  );

  const anyEventVisible = useMemo(
    () => events.some((event) => visibleEventIds.includes(event.id)),
    [events, visibleEventIds],
  );

  const allEventsVisible = useMemo(
    () => events.every((event) => visibleEventIds.includes(event.id)),
    [events, visibleEventIds],
  );

  const handleHeaderClick = useCallback(() => {
    setIsExpanded((isExpanded) => !isExpanded);
  }, []);

  const handleCheckboxClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  const handleChangeVisibility = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (timeline.events) {
        if (e.target.checked) {
          onShowTimelineEvents(timeline.events);
        } else {
          onHideTimelineEvents(timeline.events);
        }
      }
    },
    [timeline, onShowTimelineEvents, onHideTimelineEvents],
  );

  useEffect(() => {
    const prevHasSelection = prevHasSelectionRef.current;
    prevHasSelectionRef.current = hasSelection;

    if (hasSelection) {
      setIsExpanded(isEventSelected);
    } else if (prevHasSelection) {
      setIsExpanded(Boolean(isDefault));
    }
  }, [hasSelection, isEventSelected, isDefault, selectedEventIds]);

  return (
    <Box className={S.root}>
      <Flex
        className={S.header}
        align="center"
        onClick={handleHeaderClick}
        aria-label={t`Timeline card header`}
      >
        <Checkbox
          size="sm"
          checked={anyEventVisible}
          indeterminate={anyEventVisible && !allEventsVisible}
          onClick={handleCheckboxClick}
          onChange={handleChangeVisibility}
        />

        <Ellipsified
          flex="1 1 auto"
          miw={0}
          mx="sm"
          c="text-primary"
          fz="md"
          fw="bold"
          lh="1.5rem"
          tooltipProps={{ w: "auto" }}
        >
          {getTimelineName(timeline)}
        </Ellipsified>
        <Icon
          name={isExpanded ? "chevronup" : "chevrondown"}
          c="text-secondary"
          flex="0 0 auto"
          size={18}
        />
      </Flex>
      {isExpanded && (
        <Box my="md" mx="-lg">
          {events.map((event) => (
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
        </Box>
      )}
    </Box>
  );
};

const getEvents = (events: TimelineEvent[] = []) => {
  return _.chain(events)
    .sortBy((e) => e.timestamp)
    .reverse()
    .value();
};

export const TimelineCard = memo(TimelineCardInner);
