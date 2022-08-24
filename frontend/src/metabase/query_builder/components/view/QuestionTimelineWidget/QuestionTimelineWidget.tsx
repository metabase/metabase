import React from "react";
import { t } from "ttag";
import { TimelineIcon } from "./QuestionTimelineWidget.styled";
import Question from "metabase-lib/lib/Question";

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
  isTimeseries?: boolean;
}

QuestionTimelineWidget.shouldRender = ({
  question,
  isTimeseries,
}: QuestionTimelineWidgetOpts) => {
  return !question.isMetric() && isTimeseries;
};

export default QuestionTimelineWidget;
