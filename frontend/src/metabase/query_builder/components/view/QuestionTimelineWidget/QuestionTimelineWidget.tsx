import React from "react";
import { t } from "ttag";
import Question from "metabase-lib/lib/Question";
import { TimelineIcon } from "./QuestionTimelineWidget.styled";

export interface QuestionTimelineWidgetProps {
  className?: string;
  isShowingTimelineSidebar?: boolean;
  onOpenTimelines?: () => void;
  onCloseTimelines?: () => void;
}

const QuestionTimelineWidget = ({
  className,
  isShowingTimelineSidebar,
  onOpenTimelines,
  onCloseTimelines,
}: QuestionTimelineWidgetProps): JSX.Element => {
  return (
    <TimelineIcon
      className={className}
      name="calendar"
      tooltip={t`Events`}
      onClick={isShowingTimelineSidebar ? onCloseTimelines : onOpenTimelines}
    />
  );
};

export interface QuestionTimelineWidgetOpts {
  question: Question;
}

QuestionTimelineWidget.shouldRender = ({
  question,
}: QuestionTimelineWidgetOpts) => {
  return question.hasBreakoutByDateTime();
};

export default QuestionTimelineWidget;
