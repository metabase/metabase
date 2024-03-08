import { t } from "ttag";

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
  isTimeseries?: boolean;
}

QuestionTimelineWidget.shouldRender = ({
  isTimeseries,
}: QuestionTimelineWidgetOpts) => {
  return isTimeseries;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionTimelineWidget;
