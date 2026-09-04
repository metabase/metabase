import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { TimelineSidebar as SharedTimelineSidebar } from "metabase/timelines/panel/components/TimelineSidebar";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";

import {
  deselectTimelineEvents,
  selectTimelineEvents,
  updateTimelineEventsVisibility,
} from "../../../../actions/timelines";
import { onCloseTimelines, onOpenTimelines } from "../../../../store/actions";
import {
  getFocusedTimelineEventIds,
  getQuestion,
  getSelectedTimelineEventIds,
  getTimeseriesXAxis,
  getVisibleTimelineEventIds,
} from "../../../../store/selectors";

export const TimelineSidebar = () => {
  const dispatch = useDispatch();
  const collectionId = useSelector((state) =>
    getQuestion(state)?.collectionId(),
  );
  const timelines = useSelector(getTransformedTimelines);
  const visibleEventIds = useSelector(getVisibleTimelineEventIds);
  const selectedEventIds = useSelector(getSelectedTimelineEventIds);
  const focusedEventIds = useSelector(getFocusedTimelineEventIds);
  const xAxis = useSelector(getTimeseriesXAxis);

  const handleUpdateVisibility = useCallback(
    (update: TimelineEventsVisibilityUpdate) =>
      dispatch(updateTimelineEventsVisibility(update)),
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
      collectionId={collectionId}
      timelines={timelines}
      visibleEventIds={visibleEventIds}
      selectedEventIds={selectedEventIds}
      focusedEventIds={focusedEventIds}
      xAxis={xAxis}
      onUpdateVisibility={handleUpdateVisibility}
      onSelectEvents={handleSelectEvents}
      onDeselectEvents={handleDeselectEvents}
      onShowAllEvents={handleShowAllEvents}
      onClose={handleClose}
    />
  );
};
