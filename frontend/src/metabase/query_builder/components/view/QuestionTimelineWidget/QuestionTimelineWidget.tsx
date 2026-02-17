import { t } from "ttag";

import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { ViewFooterButton } from "metabase/common/components/ViewFooterButton";
import { trackSimpleEvent } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseTimelines,
  onOpenTimelines,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";
import { Indicator } from "metabase/ui";

export interface QuestionTimelineWidgetProps {
  className?: string;
}

function QuestionTimelineAcknowledgement({
  children,
}: {
  children: (props: { ack: () => void }) => React.ReactNode;
}) {
  return (
    <UserHasSeen id="events-menu">
      {({ hasSeen, ack }) => (
        <Indicator disabled={hasSeen} size={6} offset={4}>
          {children({
            ack: () => {
              trackSimpleEvent({
                event: "events_clicked",
                triggered_from: "chart",
              });
              if (!hasSeen) {
                ack();
              }
            },
          })}
        </Indicator>
      )}
    </UserHasSeen>
  );
}

export const QuestionTimelineWidget = ({
  className,
}: QuestionTimelineWidgetProps): JSX.Element => {
  const { isShowingTimelineSidebar } = useSelector(getUiControls);

  const dispatch = useDispatch();
  const handleOpenTimelines = () => dispatch(onOpenTimelines());
  const handleCloseTimelines = () => dispatch(onCloseTimelines());

  function handleClick(isShowingTimelineSidebar: boolean, ack: () => void) {
    if (isShowingTimelineSidebar) {
      handleCloseTimelines();
    } else {
      handleOpenTimelines();
    }
    ack();
  }

  return (
    <QuestionTimelineAcknowledgement>
      {({ ack }) => (
        <ViewFooterButton
          icon="calendar"
          tooltipLabel={t`Events`}
          onClick={() => handleClick(isShowingTimelineSidebar, ack)}
          className={className}
        />
      )}
    </QuestionTimelineAcknowledgement>
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
