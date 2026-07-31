import { useCallback, useMemo, useState } from "react";

import { skipToken, useListCollectionTimelinesQuery } from "metabase/api";
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
  // Fetch only when the chart can render events and this card has not turned
  // them off. Hosts like the query builder pass events in as props instead.
  const shouldFetch =
    !timelineEventsProp &&
    dashboard != null &&
    settings["timeline.events_enabled"] !== false &&
    settings["graph.x_axis.scale"] === "timeseries";

  const {
    data: timelines,
    isLoading,
    isError,
  } = useListCollectionTimelinesQuery(
    shouldFetch
      ? { id: dashboard.collection_id ?? "root", include: "events" }
      : skipToken,
  );

  const timelineEvents = useMemo(() => {
    if (timelineEventsProp) {
      return timelineEventsProp;
    }
    if (!shouldFetch || !timelines) {
      return EMPTY_EVENTS;
    }
    return timelines.flatMap((timeline) =>
      (timeline.events ?? []).filter((event) => !event.archived),
    );
  }, [timelineEventsProp, shouldFetch, timelines]);

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

  return {
    timelineEvents,
    selectedTimelineEventIds: hasExternalSelection
      ? (selectedTimelineEventIdsProp ?? EMPTY_EVENT_IDS)
      : localSelectedEventIds,
    onSelectTimelineEvents: hasExternalSelection
      ? onSelectTimelineEvents
      : handleLocalSelect,
    onDeselectTimelineEvents: hasExternalSelection
      ? onDeselectTimelineEvents
      : handleLocalDeselect,
    isLoading,
    isError,
  };
}
