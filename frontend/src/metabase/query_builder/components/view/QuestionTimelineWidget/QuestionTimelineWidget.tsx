import type { JSX } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";

import { onCloseTimelines, onOpenTimelines } from "../../../store/actions";
import { getUiControls } from "../../../store/selectors";
import { ViewFooterButton } from "../ViewFooterButton";

export interface QuestionTimelineWidgetProps {
  className?: string;
}

export const QuestionTimelineWidget = ({
  className,
}: QuestionTimelineWidgetProps): JSX.Element => {
  const { isShowingTimelineSidebar } = useSelector(getUiControls);

  const dispatch = useDispatch();
  const handleOpenTimelines = () => dispatch(onOpenTimelines());
  const handleCloseTimelines = () => dispatch(onCloseTimelines());

  function handleClick(isShowingTimelineSidebar: boolean) {
    if (isShowingTimelineSidebar) {
      handleCloseTimelines();
    } else {
      handleOpenTimelines();
    }
  }

  return (
    <ViewFooterButton
      icon="calendar"
      tooltipLabel={t`Events`}
      onClick={() => handleClick(isShowingTimelineSidebar)}
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
