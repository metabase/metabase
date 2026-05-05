import { t } from "ttag";

import { ViewFooterButton } from "metabase/common/components/ViewFooterButton";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseTimelines,
  onOpenTimelines,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";

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
