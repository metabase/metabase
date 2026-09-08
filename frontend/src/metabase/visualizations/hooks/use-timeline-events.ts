import { useMemo } from "react";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";

type UseTimelineEventsProps = Pick<
  VisualizationProps,
  "timelineEvents" | "settings" | "card"
>;

interface UseTimelineEventsResult {
  timelineEvents: TimelineEvent[];
  isLoading: boolean;
  isError: boolean;
}

// stable reference to avoid triggering re-renders
const EMPTY_EVENTS: TimelineEvent[] = [];

export function useTimelineEvents({
  timelineEvents: timelineEventsProp,
  settings,
  card,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  const selectedTimelineIds = settings["timeline.selected_timeline_ids"];
  const excludedTimelineEventIds =
    settings["timeline.excluded_timeline_event_ids"];

  // Timeline events are not a row chart feature (UXW-4833). Row charts render
  // through the shared cartesian path, so without this they would fetch — and,
  // where the query builder hands them events directly, draw — a band they do
  // not offer a way to turn on.
  const isSupported = card.display !== "row";

  const shouldFetch =
    isSupported &&
    !timelineEventsProp &&
    selectedTimelineIds != null &&
    selectedTimelineIds.length > 0;

  const {
    data: timelines = [],
    isLoading,
    isError,
  } = useListTimelinesQuery(
    shouldFetch
      ? {
          include: "events",
        }
      : skipToken,
  );

  const timelineEvents = useMemo(() => {
    if (!isSupported) {
      return EMPTY_EVENTS;
    }

    if (timelineEventsProp) {
      return timelineEventsProp;
    }

    if (!selectedTimelineIds || selectedTimelineIds.length === 0) {
      return EMPTY_EVENTS;
    }

    const selectedSet = new Set(selectedTimelineIds);
    const excludedSet = new Set(excludedTimelineEventIds ?? []);

    return timelines.flatMap((timeline) => {
      if (!selectedSet.has(timeline.id)) {
        return [];
      }
      return (timeline.events ?? []).filter(
        (event) => !excludedSet.has(event.id),
      );
    });
  }, [
    isSupported,
    timelineEventsProp,
    timelines,
    selectedTimelineIds,
    excludedTimelineEventIds,
  ]);

  return { timelineEvents, isLoading, isError };
}
