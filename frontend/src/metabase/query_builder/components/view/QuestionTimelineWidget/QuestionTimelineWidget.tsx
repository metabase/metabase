import { t } from "ttag";

import { ViewFooterButton } from "metabase/components/ViewFooterButton";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseTimelines,
  onOpenTimelines,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";

export interface QuestionTimelineWidgetProps {
  className?: string;
}

const QuestionTimelineWidget = ({
  className,
}: QuestionTimelineWidgetProps): JSX.Element => {
  const { isShowingTimelineSidebar } = useSelector(getUiControls);

  const dispatch = useDispatch();
  const handleOpenTimelines = () => dispatch(onOpenTimelines());
  const handleCloseTimelines = () => dispatch(onCloseTimelines());

  return (
    <ViewFooterButton
      icon="calendar"
      tooltipLabel={t`Events`}
      onClick={
        isShowingTimelineSidebar ? handleCloseTimelines : handleOpenTimelines
      }
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
