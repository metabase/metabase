import type {
  Timeline,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

export type TimelineEventsVisibilityUpdate = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
) => TimelineEventsVisibility;

/** the gesture behind a visibility update, for surfaces that report it */
export type TimelineEventsVisibilityIntent = "show" | "hide" | "create";

export interface AggregatedEventsVisibility {
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds: TimelineEventId[];
}
