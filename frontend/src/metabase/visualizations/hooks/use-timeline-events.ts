import { useMemo } from "react";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";

type UseTimelineEventsProps = Pick<
  VisualizationProps,
  "timelineEvents" | "settings"
> & {
  // Neither fetch nor return events, even ones passed in.
  skip?: boolean;
};

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
  skip = false,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  const selectedTimelineIds = settings["timeline.selected_timeline_ids"];
  const excludedTimelineEventIds =
    settings["timeline.excluded_timeline_event_ids"];

  const shouldFetch =
    !skip &&
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
    if (skip) {
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
    skip,
    timelineEventsProp,
    timelines,
    selectedTimelineIds,
    excludedTimelineEventIds,
  ]);

  return { timelineEvents, isLoading, isError };
}
