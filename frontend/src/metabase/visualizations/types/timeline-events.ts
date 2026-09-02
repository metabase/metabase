import type {
  Timeline,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

export type TimelineEventsVisibilityUpdate = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
) => TimelineEventsVisibility;

export interface AggregatedEventsVisibility {
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds: TimelineEventId[];
}
