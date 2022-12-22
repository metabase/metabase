import React, { useCallback } from "react";
import { t } from "ttag";
import { Moment } from "moment-timezone";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline, TimelineEvent } from "metabase-types/api";
import Question from "metabase-lib/Question";

export interface TimelineSidebarProps {
  question: Question;
  timelines: Timeline[];
  visibleTimelineIds: number[];
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  xDomain?: [Moment, Moment];
  onShowTimelines?: (timelines: Timeline[]) => void;
  onHideTimelines?: (timelines: Timeline[]) => void;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenModal?: (modal: string, modalContext?: unknown) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  timelines,
  visibleTimelineIds,
  visibleTimelineEventIds,
  selectedTimelineEventIds,
  xDomain,
  onOpenModal,
  onShowTimelines,
  onHideTimelines,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onClose,
}: TimelineSidebarProps) => {
  const handleNewEvent = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.NEW_EVENT);
  }, [onOpenModal]);

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
    },
    [onOpenModal],
  );

  const handleMoveEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.MOVE_EVENT, event.id);
    },
    [onOpenModal],
  );

  const handleToggleEventSelected = useCallback(
    (event: TimelineEvent, isSelected: boolean) => {
      if (isSelected) {
        onSelectTimelineEvents?.([event]);
      } else {
        onDeselectTimelineEvents?.();
      }
    },
    [onSelectTimelineEvents, onDeselectTimelineEvents],
  );

  const handleToggleEventVisibility = useCallback(
    (event: TimelineEvent, isVisible: boolean) => {
      if (isVisible) {
        onHideTimelineEvents([event]);
      } else {
        onShowTimelineEvents([event]);
      }
    },
    [onShowTimelineEvents, onHideTimelineEvents],
  );

  const handleToggleTimeline = useCallback(
    (
      timeline: Timeline,
      isVisible: boolean = true,
      areAllEventsVisible: boolean = false,
    ) => {
      if (isVisible) {
        onShowTimelines?.([timeline]);
        // Making the timeline visible directly
        // should make all its events visible
        // The alternative is when a timeline is hidden
        // and we make one of its events visible, in which case
        // we also make its timeline visible, but no other event in it
        if (areAllEventsVisible) {
          timeline.events && onShowTimelineEvents(timeline.events);
        }
      } else {
        onHideTimelines?.([timeline]);
        timeline.events && onHideTimelineEvents(timeline.events);
      }
    },
    [
      onShowTimelines,
      onHideTimelines,
      onHideTimelineEvents,
      onShowTimelineEvents,
    ],
  );

  return (
    <SidebarContent title={formatTitle(xDomain)} onClose={onClose}>
      <TimelinePanel
        timelines={timelines}
        collectionId={question.collectionId()}
        visibleTimelineIds={visibleTimelineIds}
        visibleEventIds={visibleTimelineEventIds}
        selectedEventIds={selectedTimelineEventIds}
        onNewEvent={handleNewEvent}
        onEditEvent={handleEditEvent}
        onMoveEvent={handleMoveEvent}
        onToggleEventSelected={handleToggleEventSelected}
        onToggleEventVisibility={handleToggleEventVisibility}
        onToggleTimeline={handleToggleTimeline}
      />
    </SidebarContent>
  );
};

const formatTitle = (xDomain?: [Moment, Moment]) => {
  return xDomain
    ? t`Events between ${formatDate(xDomain[0])} and ${formatDate(xDomain[1])}`
    : t`Events`;
};

const formatDate = (date: Moment) => {
  return date.format("ll");
};

export default TimelineSidebar;
