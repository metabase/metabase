import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { TimelineSidebar as SharedTimelineSidebar } from "metabase/timelines/panel/components/TimelineSidebar";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import {
  deselectTimelineEvents,
  hideTimeline,
  hideTimelineEvents,
  selectTimelineEvents,
  showCreatedTimelineEvent,
  showTimeline,
  showTimelineEvents,
} from "../../../../actions/timelines";
import { onCloseTimelines, onOpenTimelines } from "../../../../store/actions";
import {
  getFilteredTimelines,
  getQuestion,
  getSelectedTimelineEventIds,
  getTimeseriesXAxis,
  getUiControls,
  getVisibleTimelineEventIds,
} from "../../../../store/selectors";

export const TimelineSidebar = () => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const timelines = useSelector(getFilteredTimelines);
  const visibleEventIds = useSelector(getVisibleTimelineEventIds);
  const selectedEventIds = useSelector(getSelectedTimelineEventIds);
  const { focusedTimelineEventIds } = useSelector(getUiControls);
  const xAxis = useSelector(getTimeseriesXAxis);

  const handleShowTimelineEvents = useCallback(
    (events: TimelineEvent[]) => dispatch(showTimelineEvents(events)),
    [dispatch],
  );
  const handleHideTimelineEvents = useCallback(
    (events: TimelineEvent[]) => dispatch(hideTimelineEvents(events)),
    [dispatch],
  );
  const handleShowTimeline = useCallback(
    (timeline: Timeline) => dispatch(showTimeline(timeline)),
    [dispatch],
  );
  const handleHideTimeline = useCallback(
    (timeline: Timeline) => dispatch(hideTimeline(timeline)),
    [dispatch],
  );
  const handleSelectEvents = useCallback(
    (events: TimelineEvent[]) => dispatch(selectTimelineEvents(events)),
    [dispatch],
  );
  const handleDeselectEvents = useCallback(
    () => dispatch(deselectTimelineEvents()),
    [dispatch],
  );
  const handleEventCreated = useCallback(
    (event: TimelineEvent) => dispatch(showCreatedTimelineEvent(event)),
    [dispatch],
  );
  const handleShowAllEvents = useCallback(
    () => dispatch(onOpenTimelines()),
    [dispatch],
  );
  const handleClose = useCallback(
    () => dispatch(onCloseTimelines()),
    [dispatch],
  );

  return (
    <SharedTimelineSidebar
      collectionId={question?.collectionId()}
      timelines={timelines}
      visibleEventIds={visibleEventIds}
      selectedEventIds={selectedEventIds}
      focusedEventIds={focusedTimelineEventIds}
      xAxis={xAxis}
      onShowTimelineEvents={handleShowTimelineEvents}
      onHideTimelineEvents={handleHideTimelineEvents}
      onShowTimeline={handleShowTimeline}
      onHideTimeline={handleHideTimeline}
      onSelectEvents={handleSelectEvents}
      onDeselectEvents={handleDeselectEvents}
      onEventCreated={handleEventCreated}
      onShowAllEvents={handleShowAllEvents}
      onClose={handleClose}
    />
  );
};
