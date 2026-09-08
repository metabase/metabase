import { useEffect, useMemo } from "react";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  getRecordedTimelineEventsVisibility,
  isTimelineEventsEnabled,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getTimeseriesXAxis, isTimelineEventInRange } from "metabase/viz-core";
import type { Timeline, TimelineEvent } from "metabase-types/api";

type UseTimelineEventsProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "timelineEventsVisibility"
  | "settings"
  | "series"
  | "onTimelineEventsShown"
>;

interface UseTimelineEventsResult {
  timelineEvents: TimelineEvent[];
  isLoading: boolean;
  isError: boolean;
}

// stable references to avoid triggering re-renders
const EMPTY_EVENTS: TimelineEvent[] = [];
const NO_TIMELINES: Timeline[] = [];

const canLoadTimelineEvents = () =>
  !isPublicEmbedding() && !isStaticEmbedding() && !isEmbeddingSdk();

export function useTimelineEvents({
  timelineEvents: explicitEvents,
  timelineEventsVisibility,
  settings,
  series,
  onTimelineEventsShown,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  // null is the host opting out; undefined falls back to the card settings
  const isEnabled =
    timelineEventsVisibility !== null && isTimelineEventsEnabled(settings);
  const visibility = isEnabled
    ? (timelineEventsVisibility ??
      getRecordedTimelineEventsVisibility(settings))
    : undefined;
  const hasSelection =
    (visibility?.["timeline.selected_timeline_ids"]?.length ?? 0) > 0;

  const shouldFetch =
    isEnabled && !explicitEvents && hasSelection && canLoadTimelineEvents();

  const {
    data: timelines = NO_TIMELINES,
    isLoading,
    isError,
  } = useListTimelinesQuery(shouldFetch ? { include: "events" } : skipToken);

  const timelineEvents = useMemo(() => {
    if (!isEnabled) {
      return EMPTY_EVENTS;
    }
    const candidates =
      explicitEvents ?? resolveVisibleTimelineEvents({ timelines, visibility });
    if (candidates.length === 0) {
      return EMPTY_EVENTS;
    }
    const xAxis = getTimeseriesXAxis(series, settings);
    const domain = xAxis?.domain;
    if (xAxis == null || domain == null) {
      return EMPTY_EVENTS;
    }
    const events = candidates.filter((event) =>
      isTimelineEventInRange(event, domain, xAxis.interval),
    );
    return events.length > 0 ? events : EMPTY_EVENTS;
  }, [isEnabled, explicitEvents, timelines, visibility, series, settings]);

  useEffect(() => {
    if (timelineEvents.length > 0) {
      onTimelineEventsShown?.();
    }
  }, [timelineEvents, onTimelineEventsShown]);

  return { timelineEvents, isLoading, isError };
}
