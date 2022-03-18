import React, { useCallback } from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  visibleTimelineIds: number[];
  selectedTimelineEventIds: number[];
  onShowTimelines?: (timelines: Timeline[]) => void;
  onHideTimelines?: (timelines: Timeline[]) => void;
  onOpenModal?: (modal: string, modalContext?: unknown) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  visibleTimelineIds,
  selectedTimelineEventIds,
  onOpenModal,
  onShowTimelines,
  onHideTimelines,
  onClose,
}: TimelineSidebarProps) => {
  const handleNewEvent = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.NEW_EVENT);
  }, [onOpenModal]);

  const handleNewEventWithTimeline = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.NEW_EVENT_WITH_TIMELINE);
  }, [onOpenModal]);

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
    },
    [onOpenModal],
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
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelinePanel
        visibleTimelineIds={visibleTimelineIds}
        selectedEventIds={selectedTimelineEventIds}
        collectionId={question.collectionId()}
        onNewEvent={handleNewEvent}
        onNewEventWithTimeline={handleNewEventWithTimeline}
        onEditEvent={handleEditEvent}
        onToggleTimeline={handleToggleTimeline}
      />
    </SidebarContent>
  );
};

export default TimelineSidebar;
