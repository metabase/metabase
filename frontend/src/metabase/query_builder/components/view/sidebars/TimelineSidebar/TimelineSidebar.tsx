import React, { useCallback } from "react";
import { t } from "ttag";
import { Moment } from "moment";
import Question from "metabase-lib/lib/Question";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  timelines: Timeline[];
  visibleTimelineIds: number[];
  selectedTimelineEventIds: number[];
  xDomain?: [Moment, Moment];
  onShowTimelines?: (timelines: Timeline[]) => void;
  onHideTimelines?: (timelines: Timeline[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenModal?: (modal: string, modalContext?: unknown) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  timelines,
  visibleTimelineIds,
  selectedTimelineEventIds,
  xDomain,
  onOpenModal,
  onShowTimelines,
  onHideTimelines,
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

  const handleToggleEvent = useCallback(
    (event: TimelineEvent, isSelected: boolean) => {
      if (isSelected) {
        onSelectTimelineEvents?.([event]);
      } else {
        onDeselectTimelineEvents?.();
      }
    },
    [onSelectTimelineEvents, onDeselectTimelineEvents],
  );

  const handleToggleTimeline = useCallback(
    (timeline: Timeline, isVisible: boolean) => {
      if (isVisible) {
        onShowTimelines?.([timeline]);
      } else {
        onHideTimelines?.([timeline]);
      }
    },
    [onShowTimelines, onHideTimelines],
  );

  return (
    <SidebarContent title={formatTitle(xDomain)} onClose={onClose}>
      <TimelinePanel
        timelines={timelines}
        collectionId={question.collectionId()}
        visibleTimelineIds={visibleTimelineIds}
        selectedEventIds={selectedTimelineEventIds}
        onNewEvent={handleNewEvent}
        onEditEvent={handleEditEvent}
        onMoveEvent={handleMoveEvent}
        onToggleEvent={handleToggleEvent}
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
