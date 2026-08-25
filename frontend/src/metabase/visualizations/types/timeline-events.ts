import type {
  Timeline,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

export interface TimelineEventsVisibilityContext {
  timelines: Timeline[];
}

export type TimelineEventsVisibilityUpdate = (
  visibility: TimelineEventsVisibility,
  context: TimelineEventsVisibilityContext,
) => TimelineEventsVisibility;

export interface AggregatedEventsVisibility {
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds: TimelineEventId[];
}
