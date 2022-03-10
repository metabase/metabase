import React, { useCallback } from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  visibility: Record<number, boolean>;
  onShowTimeline?: (timeline: Timeline) => void;
  onHideTimeline?: (timeline: Timeline) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  visibility,
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

  return (
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelinePanel
        cardId={question.id()}
        collectionId={question.collectionId()}
        visibility={visibility}
        onToggleTimeline={handleToggleTimeline}
      />
    </SidebarContent>
  );
};

export default TimelineSidebar;
