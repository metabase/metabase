import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";

export interface TimelineSidebarProps {
  question: Question;
  onClose?: () => void;
}

const TimelineSidebar = ({ question, onClose }: TimelineSidebarProps) => {
  return (
    <SidebarContent title={t`Events`} onClose={onClose}>
      <TimelinePanel cardId={question.id()} />
    </SidebarContent>
  );
};

export default TimelineSidebar;
