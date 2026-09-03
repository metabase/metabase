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
  getIsTimelineEventsDashCard,
  getTimelineEventsDashCardIds,
} from "./selectors";

const NO_VISIBILITY: TimelineEventsVisibility = {};

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

export const useDashCardTimelineEvents = (
  dashcard: DashboardCard,
): { isEnabled: boolean } & DashCardTimelineEventsProps => {
  const dispatch = useDispatch();
  const { withTimelineEvents = false } = useDashboardContext();
  const dashcardId: DashCardId = dashcard.id;
  const isEnabled = useSelector(
    (state) =>
      withTimelineEvents && getIsTimelineEventsDashCard(state, dashcardId),
  );

  const timelineEventsVisibility = useSelector((state) =>
    isEnabled
      ? (getDashCardTimelineEventsVisibility(state, dashcardId) ??
        NO_VISIBILITY)
      : null,
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

  return {
    isEnabled,
    timelineEventsVisibility,
    selectedTimelineEventIds,
    onOpenTimelines: isEnabled ? onOpenTimelines : undefined,
    onSelectTimelineEvents: isEnabled ? onSelectTimelineEvents : undefined,
    onDeselectTimelineEvents: isEnabled ? onDeselectTimelineEvents : undefined,
    onTimelineEventsShown: isEnabled ? onTimelineEventsShown : undefined,
  };
};
