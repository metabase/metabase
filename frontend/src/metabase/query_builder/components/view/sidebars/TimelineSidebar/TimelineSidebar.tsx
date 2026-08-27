import { useCallback } from "react";

import {
  getTimeseriesDataInterval,
  getUiControls,
} from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { onOpenTimelines } from "metabase/redux/query-builder";
import {
  TimelineSidebar as SharedTimelineSidebar,
  type TimelineSidebarProps as SharedTimelineSidebarProps,
} from "metabase/timelines/questions/components/TimelineSidebar";

export type TimelineSidebarProps = Omit<
  SharedTimelineSidebarProps,
  "focusedTimelineEventIds" | "dataInterval" | "onShowAllEvents"
>;

export const TimelineSidebar = ({
  collectionId,
  timelines,
  visibleTimelineEventIds,
  selectedTimelineEventIds,
  xDomain,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onOpenModal,
  onClose,
}: TimelineSidebarProps) => {
  const dispatch = useDispatch();
  const { focusedTimelineEventIds } = useSelector(getUiControls);
  const dataInterval = useSelector(getTimeseriesDataInterval);

  const handleShowAllEvents = useCallback(() => {
    dispatch(onOpenTimelines());
  }, [dispatch]);

  return (
    <SharedTimelineSidebar
      collectionId={collectionId}
      timelines={timelines}
      visibleTimelineEventIds={visibleTimelineEventIds}
      selectedTimelineEventIds={selectedTimelineEventIds}
      focusedTimelineEventIds={focusedTimelineEventIds}
      dataInterval={dataInterval}
      xDomain={xDomain}
      onShowTimelineEvents={onShowTimelineEvents}
      onHideTimelineEvents={onHideTimelineEvents}
      onSelectTimelineEvents={onSelectTimelineEvents}
      onDeselectTimelineEvents={onDeselectTimelineEvents}
      onShowAllEvents={handleShowAllEvents}
      onOpenModal={onOpenModal}
      onClose={onClose}
    />
  );
};
