import React, { useCallback } from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  visibility: Record<number, boolean>;
  onShowTimeline?: (timeline: Timeline) => void;
  onHideTimeline?: (timeline: Timeline) => void;
  onOpenModal?: (modal: string, modalContext?: unknown) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  visibility,
  onOpenModal,
  onShowTimeline,
  onHideTimeline,
  onClose,
}: TimelineSidebarProps) => {
  const handleToggleTimeline = useCallback(
    (timeline: Timeline, isVisible: boolean) => {
      if (isVisible) {
        onShowTimeline?.(timeline);
      } else {
        onHideTimeline?.(timeline);
      }
    },
    [onShowTimeline, onHideTimeline],
  );

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
    },
    [onOpenModal],
  );

  return (
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelinePanel
        cardId={question.id()}
        collectionId={question.collectionId()}
        visibility={visibility}
        onToggleTimeline={handleToggleTimeline}
        onEditEvent={handleEditEvent}
      />
    </SidebarContent>
  );
};

export default TimelineSidebar;
