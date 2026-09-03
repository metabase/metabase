import { useEffect, useMemo } from "react";
import _ from "underscore";

import { skipToken, useListTimelinesQuery } from "metabase/api";
import { dayjs } from "metabase/dayjs";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  getRecordedTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getTimeseriesXAxis, isTimelineEventInRange } from "metabase/viz-core";
import type { TimelineEvent } from "metabase-types/api";

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

// stable reference to avoid triggering re-renders
const EMPTY_EVENTS: TimelineEvent[] = [];

const canLoadTimelineEvents = () =>
  !isPublicEmbedding() && !isStaticEmbedding() && !isEmbeddingSdk();

const hasSeriesData = (series: VisualizationProps["series"]) =>
  series.length > 0 && series.every((single) => single.data != null);

const sortByTimestamp = (events: TimelineEvent[]) =>
  _.sortBy(events, (event) => dayjs(event.timestamp).valueOf());

export function useTimelineEvents({
  timelineEvents: explicitEvents,
  timelineEventsVisibility,
  settings,
  series,
  onTimelineEventsShown,
}: UseTimelineEventsProps): UseTimelineEventsResult {
  const isEnabled =
    timelineEventsVisibility !== null &&
    settings["timeline_events.enabled"] !== false;
  const visibility = isEnabled
    ? (timelineEventsVisibility ??
      getRecordedTimelineEventsVisibility(settings))
    : undefined;
  const hasSelection =
    (visibility?.["timeline.selected_timeline_ids"]?.length ?? 0) > 0;

  const shouldFetch =
    isEnabled && !explicitEvents && hasSelection && canLoadTimelineEvents();

  const {
    data: timelines = [],
    isLoading,
    isError,
  } = useListTimelinesQuery(shouldFetch ? { include: "events" } : skipToken);

  const xAxis = useMemo(
    () => (hasSeriesData(series) ? getTimeseriesXAxis(series, settings) : null),
    [series, settings],
  );

  const timelineEvents = useMemo(() => {
    const domain = xAxis?.domain;
    if (!isEnabled || xAxis == null || domain == null) {
      return EMPTY_EVENTS;
    }
    const candidates = explicitEvents
      ? sortByTimestamp(explicitEvents.filter((event) => !event.archived))
      : shouldFetch
        ? resolveVisibleTimelineEvents({ timelines, visibility })
        : EMPTY_EVENTS;
    const events = candidates.filter((event) =>
      isTimelineEventInRange(event, domain, xAxis.interval),
    );
    return events.length > 0 ? events : EMPTY_EVENTS;
  }, [isEnabled, explicitEvents, shouldFetch, timelines, visibility, xAxis]);

  useEffect(() => {
    if (timelineEvents.length > 0) {
      onTimelineEventsShown?.(timelineEvents);
    }
  }, [timelineEvents, onTimelineEventsShown]);

  return { timelineEvents, isLoading, isError };
}
