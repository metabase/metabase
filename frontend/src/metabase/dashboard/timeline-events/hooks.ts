import { useCallback } from "react";

import { useListTimelinesQuery } from "metabase/api";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch, useSelector } from "metabase/redux";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  DashCardId,
  DashboardCard,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

import {
  deselectTimelineEvents,
  openEventsSidebar,
  selectTimelineEvents,
  trackTimelineEventsShown,
} from "../actions/timeline-events";

import {
  getDashCardSelectedTimelineEventIds,
  getDashCardTimelineEventsVisibility,
  getDashCardTimeseriesXAxis,
  getTimelineEventsDashCardIds,
} from "./selectors";

// keeps the timelines loaded for the events sidebar; charts load their own
export const useDashboardTimelines = () => {
  const { withTimelineEvents } = useDashboardContext();
  const hasEventsDashCards = useSelector(
    (state) => getTimelineEventsDashCardIds(state).length > 0,
  );

  useListTimelinesQuery(
    { include: "events" },
    { skip: !withTimelineEvents || !hasEventsDashCards },
  );
};

type DashCardTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEventsVisibility"
  | "selectedTimelineEventIds"
  | "onOpenTimelines"
  | "onSelectTimelineEvents"
  | "onDeselectTimelineEvents"
  | "onTimelineEventsShown"
>;

type DashCardTimelineEvents = {
  isEnabled: boolean;
} & DashCardTimelineEventsProps;

const NO_TIMELINE_EVENTS: TimelineEventsVisibility = {
  "timeline.selected_timeline_ids": [],
};

const DISABLED: DashCardTimelineEvents = {
  isEnabled: false,
  timelineEventsVisibility: NO_TIMELINE_EVENTS,
};

export const useDashCardTimelineEvents = (
  dashcard: DashboardCard,
): DashCardTimelineEvents => {
  const dispatch = useDispatch();
  const { withTimelineEvents = false } = useDashboardContext();
  const dashcardId: DashCardId = dashcard.id;
  const isEnabled = useSelector(
    (state) =>
      withTimelineEvents &&
      getDashCardTimeseriesXAxis(state, dashcardId) != null,
  );

  const timelineEventsVisibility = useSelector((state) =>
    isEnabled
      ? getDashCardTimelineEventsVisibility(state, dashcardId)
      : NO_TIMELINE_EVENTS,
  );
  const selectedTimelineEventIds = useSelector((state) =>
    isEnabled
      ? getDashCardSelectedTimelineEventIds(state, dashcardId)
      : undefined,
  );

  const onOpenTimelines = useCallback(
    (eventIds?: TimelineEventId[]) =>
      dispatch(openEventsSidebar({ dashcardId, focusedEventIds: eventIds })),
    [dispatch, dashcardId],
  );
  const onSelectTimelineEvents = useCallback(
    (events: TimelineEvent[]) =>
      dispatch(
        selectTimelineEvents({
          dashcardId,
          eventIds: events.map((event) => event.id),
        }),
      ),
    [dispatch, dashcardId],
  );
  const onDeselectTimelineEvents = useCallback(
    () => dispatch(deselectTimelineEvents()),
    [dispatch],
  );
  const onTimelineEventsShown = useCallback(
    () => dispatch(trackTimelineEventsShown()),
    [dispatch],
  );

  if (!isEnabled) {
    return DISABLED;
  }
  return {
    isEnabled,
    timelineEventsVisibility,
    selectedTimelineEventIds,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    onTimelineEventsShown,
  };
};
