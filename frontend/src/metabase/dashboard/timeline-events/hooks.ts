import { useCallback } from "react";

import { useListTimelinesQuery } from "metabase/api";
import { useDashboardContext } from "metabase/dashboard/context";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { useDispatch, useSelector } from "metabase/redux";
import { getRecordedTimelineEventsVisibility } from "metabase/visualizations/lib/timeline-events-visibility";
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
  getHasSelectedTimelineEvents,
} from "./selectors";

// keeps the timelines loaded for the events sidebar; charts load their own
export const useDashboardTimelines = () => {
  const { withTimelineEvents } = useDashboardContext();
  const hasSelectedEvents = useSelector(getHasSelectedTimelineEvents);

  useListTimelinesQuery(
    { include: "events" },
    { skip: !withTimelineEvents || !hasSelectedEvents },
  );
};

type DashCardTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
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

const EMPTY_EVENTS: TimelineEvent[] = [];

const DISABLED: DashCardTimelineEvents = {
  isEnabled: false,
  timelineEvents: EMPTY_EVENTS,
  timelineEventsVisibility: NO_TIMELINE_EVENTS,
};

export const useDashCardTimelineEvents = (
  dashcard: DashboardCard,
): DashCardTimelineEvents => {
  const dispatch = useDispatch();
  const { withTimelineEvents = false, isFullscreen } = useDashboardContext();
  const dashcardId: DashCardId = dashcard.id;
  const canDisplayEvents = useSelector(
    (state) => getDashCardTimeseriesXAxis(state, dashcardId) != null,
  );
  const showsEvents = withTimelineEvents && canDisplayEvents;
  // fullscreen hides every sidebar, so the panel these controls open could never appear; the chips
  // still render, so the chart is still an impression
  const isEnabled = showsEvents && !isFullscreen;

  const timelineEventsVisibility = useSelector((state) => {
    if (!canDisplayEvents) {
      return NO_TIMELINE_EVENTS;
    }
    return withTimelineEvents
      ? getDashCardTimelineEventsVisibility(state, dashcardId)
      : getRecordedTimelineEventsVisibility(
          dashcard.card?.visualization_settings,
        );
  });
  const selectedTimelineEventIds = useSelector((state) =>
    isEnabled
      ? getDashCardSelectedTimelineEventIds(state, dashcardId)
      : undefined,
  );

  const onOpenTimelines = useCallback(
    (eventIds?: TimelineEventId[]) =>
      dispatch(
        openEventsSidebar({ dashcardId, focusedEventIds: eventIds }, "chart"),
      ),
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

  if (!canDisplayEvents) {
    return DISABLED;
  }

  const timelineEvents =
    dashcard.timeline_events ??
    (isPublicEmbedding() || isStaticEmbedding() ? EMPTY_EVENTS : undefined);

  if (!isEnabled) {
    return {
      isEnabled: false,
      timelineEvents,
      timelineEventsVisibility,
      onTimelineEventsShown: showsEvents ? onTimelineEventsShown : undefined,
    };
  }

  return {
    isEnabled,
    timelineEvents,
    timelineEventsVisibility,
    selectedTimelineEventIds,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    onTimelineEventsShown,
  };
};
