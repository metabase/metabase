import { useCallback, useEffect, useRef } from "react";

import { useListTimelinesQuery } from "metabase/api";
import { trackDashboardEventsShown } from "metabase/dashboard/analytics";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch, useSelector } from "metabase/redux";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  DashCardId,
  DashboardCard,
  DashboardId,
  TimelineEvent,
  TimelineEventId,
} from "metabase-types/api";

import {
  deselectTimelineEvents,
  openEventsSidebar,
  selectTimelineEvents,
} from "../actions/timeline-events";

import {
  getDashCardSelectedTimelineEventIds,
  getDashCardVisibleTimelineEvents,
  getHasVisibleTimelineEvents,
  getIsTimelineEventsDashCard,
  getTimelineEventsDashCardIds,
} from "./selectors";

const NO_EVENTS: TimelineEvent[] = [];

export const useDashboardTimelines = () => {
  const { withTimelineEvents } = useDashboardContext();
  const hasEventsDashCards = useSelector(
    (state) => getTimelineEventsDashCardIds(state).length > 0,
  );

  useListTimelinesQuery(
    { include: "events" },
    { skip: !withTimelineEvents || !hasEventsDashCards },
  );

  useTrackDashboardEventsShown();
};

const useTrackDashboardEventsShown = () => {
  const { dashboard, withTimelineEvents } = useDashboardContext();
  const dashboardId = dashboard?.id;
  const hasVisibleEvents = useSelector(
    (state) => !!withTimelineEvents && getHasVisibleTimelineEvents(state),
  );
  const trackedDashboardIdRef = useRef<DashboardId>();

  useEffect(() => {
    const isTracked = trackedDashboardIdRef.current === dashboardId;
    if (hasVisibleEvents && dashboardId != null && !isTracked) {
      trackedDashboardIdRef.current = dashboardId;
      trackDashboardEventsShown(dashboardId);
    }
  }, [dashboardId, hasVisibleEvents]);
};

type DashCardTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "selectedTimelineEventIds"
  | "onOpenTimelines"
  | "onSelectTimelineEvents"
  | "onDeselectTimelineEvents"
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

  const timelineEvents = useSelector((state) =>
    isEnabled ? getDashCardVisibleTimelineEvents(state, dashcardId) : NO_EVENTS,
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

  return {
    isEnabled,
    timelineEvents,
    selectedTimelineEventIds,
    onOpenTimelines: isEnabled ? onOpenTimelines : undefined,
    onSelectTimelineEvents: isEnabled ? onSelectTimelineEvents : undefined,
    onDeselectTimelineEvents: isEnabled ? onDeselectTimelineEvents : undefined,
  };
};
