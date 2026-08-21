import type {
  CollectionId,
  Timeline,
  TimelineEventId,
} from "metabase-types/api";

export interface TimelineEventsVisibilityContext {
  timelines: Timeline[];
  collectionId: CollectionId | null | undefined;
}

export interface AggregatedEventsVisibility {
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds: TimelineEventId[];
}
