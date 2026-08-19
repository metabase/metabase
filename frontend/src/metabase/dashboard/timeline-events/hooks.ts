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
} from "metabase-types/api";

import {
  deselectTimelineEvents,
  openEventsSidebar,
  selectTimelineEvents,
} from "../actions/timeline-events";

import {
  getDashCardSelectedTimelineEventIds,
  getDashCardVisibleTimelineEvents,
  getTimelineEventsDashCardIds,
} from "./selectors";
import { isTimelineEventsDashCard } from "./utils";

export const useDashboardTimelines = () => {
  const { withTimelineEvents } = useDashboardContext();
  const hasEventsDashCards =
    useSelector(getTimelineEventsDashCardIds).length > 0;

  useListTimelinesQuery(
    { include: "events" },
    { skip: !withTimelineEvents || !hasEventsDashCards },
  );
};

type DashCardTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "selectedTimelineEventIds"
  | "onOpenTimelines"
  | "onSelectTimelineEvents"
  | "onDeselectTimelineEvents"
>;

const NO_TIMELINE_EVENTS_PROPS: DashCardTimelineEventsProps = {};

export const useDashCardTimelineEvents = (
  dashcard: DashboardCard,
): { isEnabled: boolean; props: DashCardTimelineEventsProps } => {
  const dispatch = useDispatch();
  const { withTimelineEvents } = useDashboardContext();
  const dashcardId: DashCardId = dashcard.id;
  const isEnabled =
    Boolean(withTimelineEvents) && isTimelineEventsDashCard(dashcard);

  const timelineEvents = useSelector((state) =>
    isEnabled ? getDashCardVisibleTimelineEvents(state, dashcardId) : undefined,
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
    props: isEnabled
      ? {
          timelineEvents,
          selectedTimelineEventIds,
          onOpenTimelines,
          onSelectTimelineEvents,
          onDeselectTimelineEvents,
        }
      : NO_TIMELINE_EVENTS_PROPS,
  };
};
