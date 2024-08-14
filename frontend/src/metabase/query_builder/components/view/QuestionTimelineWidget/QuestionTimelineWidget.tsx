import { t } from "ttag";

import { ViewFooterButton } from "metabase/components/ViewFooterButton";

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
    <ViewFooterButton
      icon="calendar"
      tooltipLabel={t`Events`}
      onClick={isShowingTimelineSidebar ? onCloseTimelines : onOpenTimelines}
      className={className}
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
