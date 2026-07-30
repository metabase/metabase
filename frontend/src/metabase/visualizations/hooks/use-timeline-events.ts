import { useCallback, useMemo, useState } from "react";

import {
  skipToken,
  useListCollectionTimelinesQuery,
  useListTimelinesQuery,
} from "metabase/api";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

type UseTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "settings"
  | "dashboard"
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
  dashboard,
  selectedTimelineEventIds: selectedTimelineEventIdsProp,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  const selectedTimelineIds = settings["timeline.selected_timeline_ids"];
  const excludedTimelineEventIds =
    settings["timeline.excluded_timeline_event_ids"];

  // An absent selection falls back to the dashboard collection's timelines;
  // an explicitly empty selection hides events on this card.
  const hasExplicitSelection = selectedTimelineIds != null;

  const shouldFetchSelected =
    !timelineEventsProp &&
    hasExplicitSelection &&
    selectedTimelineIds.length > 0;

  // Sorted copy so that the same selection always produces the same cache key,
  // letting dashcards with equal selections share one request.
  const timelineIds = useMemo(
    () =>
      selectedTimelineIds ? [...selectedTimelineIds].sort((a, b) => a - b) : [],
    [selectedTimelineIds],
  );

  const selectedQuery = useListTimelinesQuery(
    shouldFetchSelected ? { id: timelineIds, include: "events" } : skipToken,
  );

  const shouldFetchCollection =
    !timelineEventsProp && !hasExplicitSelection && dashboard != null;

  const collectionQuery = useListCollectionTimelinesQuery(
    shouldFetchCollection
      ? { id: dashboard.collection_id ?? "root", include: "events" }
      : skipToken,
  );

  const selectedTimelines = selectedQuery.data;
  const collectionTimelines = collectionQuery.data;

  const timelineEvents = useMemo(() => {
    if (timelineEventsProp) {
      return timelineEventsProp;
    }

    if (!shouldFetchSelected && !shouldFetchCollection) {
      return EMPTY_EVENTS;
    }

    const timelines =
      (shouldFetchCollection ? collectionTimelines : selectedTimelines) ?? [];
    const selectedSet = new Set(selectedTimelineIds ?? []);
    const excludedSet = new Set(excludedTimelineEventIds ?? []);

    return timelines.flatMap((timeline) => {
      if (shouldFetchSelected && !selectedSet.has(timeline.id)) {
        return [];
      }
      return (timeline.events ?? []).filter(
        (event) => !excludedSet.has(event.id) && !event.archived,
      );
    });
  }, [
    timelineEventsProp,
    selectedTimelines,
    collectionTimelines,
    selectedTimelineIds,
    excludedTimelineEventIds,
    shouldFetchSelected,
    shouldFetchCollection,
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

  const isLoading = shouldFetchCollection
    ? collectionQuery.isLoading
    : selectedQuery.isLoading;
  const isError = shouldFetchCollection
    ? collectionQuery.isError
    : selectedQuery.isError;

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
