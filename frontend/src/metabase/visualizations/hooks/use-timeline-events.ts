import { useCallback, useMemo, useState } from "react";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

type UseTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "settings"
  | "selectedTimelineEventIds"
  | "onSelectTimelineEvents"
  | "onDeselectTimelineEvents"
>;

interface UseTimelineEventsResult {
  timelineEvents: TimelineEvent[];
  selectedTimelineEventIds: TimelineEventId[];
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  isLoading: boolean;
  isError: boolean;
}

// stable references to avoid triggering re-renders
const EMPTY_EVENTS: TimelineEvent[] = [];
const EMPTY_EVENT_IDS: TimelineEventId[] = [];

export function useTimelineEvents({
  timelineEvents: timelineEventsProp,
  settings,
  selectedTimelineEventIds: selectedTimelineEventIdsProp,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  const selectedTimelineIds = settings["timeline.selected_timeline_ids"];
  const excludedTimelineEventIds =
    settings["timeline.excluded_timeline_event_ids"];

  const shouldFetch =
    !timelineEventsProp &&
    selectedTimelineIds != null &&
    selectedTimelineIds.length > 0;

  const {
    data: timelines = [],
    isLoading,
    isError,
  } = useListTimelinesQuery(shouldFetch ? { include: "events" } : skipToken);

  const timelineEvents = useMemo(() => {
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
        (event) => !excludedSet.has(event.id) && !event.archived,
      );
    });
  }, [
    timelineEventsProp,
    timelines,
    selectedTimelineIds,
    excludedTimelineEventIds,
  ]);

  // Hosts like the query builder own event selection via props; when a host
  // does not (e.g. dashboards), fall back to local selection so clicking a
  // chip still highlights the event on the chart.
  const hasExternalSelection =
    onSelectTimelineEvents != null || onDeselectTimelineEvents != null;

  const [localSelectedEventIds, setLocalSelectedEventIds] =
    useState<TimelineEventId[]>(EMPTY_EVENT_IDS);

  const handleLocalSelect = useCallback((events: TimelineEvent[]) => {
    setLocalSelectedEventIds(events.map((event) => event.id));
  }, []);

  const handleLocalDeselect = useCallback(() => {
    setLocalSelectedEventIds(EMPTY_EVENT_IDS);
  }, []);

  if (hasExternalSelection || timelineEvents.length === 0) {
    return {
      timelineEvents,
      selectedTimelineEventIds: selectedTimelineEventIdsProp ?? EMPTY_EVENT_IDS,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
      isLoading,
      isError,
    };
  }

  return {
    timelineEvents,
    selectedTimelineEventIds: localSelectedEventIds,
    onSelectTimelineEvents: handleLocalSelect,
    onDeselectTimelineEvents: handleLocalDeselect,
    isLoading,
    isError,
  };
}
