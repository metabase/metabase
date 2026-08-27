import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import {
  TimelineSidebar as SharedTimelineSidebar,
  type TimelineSidebarProps as SharedTimelineSidebarProps,
} from "metabase/timelines/panel/components/TimelineSidebar";
import type { Timeline } from "metabase-types/api";

import { hideTimeline, showTimeline } from "../../../../actions/timelines";
import { onOpenTimelines } from "../../../../store/actions";
import {
  getTimeseriesDataInterval,
  getUiControls,
} from "../../../../store/selectors";

export type TimelineSidebarProps = Omit<
  SharedTimelineSidebarProps,
  | "focusedTimelineEventIds"
  | "dataInterval"
  | "onShowAllEvents"
  | "onShowTimeline"
  | "onHideTimeline"
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

  // Selecting a whole timeline is recorded as such in the question's
  // visualization settings, rather than as its events one by one.
  const handleShowTimeline = useCallback(
    (timeline: Timeline) => dispatch(showTimeline(timeline)),
    [dispatch],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) => dispatch(hideTimeline(timeline)),
    [dispatch],
  );

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
      onShowTimeline={handleShowTimeline}
      onHideTimeline={handleHideTimeline}
      onShowAllEvents={handleShowAllEvents}
      onOpenModal={onOpenModal}
      onClose={onClose}
    />
  );
};
