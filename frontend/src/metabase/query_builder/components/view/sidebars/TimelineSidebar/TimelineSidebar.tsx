import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Timeline } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  timelineVisibility: Record<number, boolean>;
  onShowTimeline?: (timeline: Timeline) => void;
  onHideTimeline?: (timeline: Timeline) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  timelineVisibility,
  onShowTimeline,
  onHideTimeline,
  onClose,
}: TimelineSidebarProps) => {
  return (
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelinePanel
        cardId={question.id()}
        timelineVisibility={timelineVisibility}
        isVisibleByDefault={question.isSaved()}
        onShowTimeline={onShowTimeline}
        onHideTimeline={onHideTimeline}
      />
    </SidebarContent>
  );
};

export default TimelineSidebar;
