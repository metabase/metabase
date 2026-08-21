import type { Timeline, TimelineEventId } from "metabase-types/api";

export interface TimelineEventsVisibilityContext {
  timelines: Timeline[];
}

export interface AggregatedEventsVisibility {
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds: TimelineEventId[];
}
