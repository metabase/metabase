import _ from "underscore";

import { canonicalCollectionId } from "metabase/common/collections/utils";
import type {
  CollectionId,
  Timeline,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
  TimelineId,
} from "metabase-types/api";

const isCollectionTimeline = (
  timeline: Timeline,
  collectionId: CollectionId | null | undefined,
) => timeline.collection_id === canonicalCollectionId(collectionId);

/**
 * Timelines of the collection an entity lives in; their events are visible by
 * default. "root" and no collection both mean the root collection.
 */
export const getCollectionTimelines = (
  timelines: Timeline[],
  collectionId: CollectionId | null | undefined,
): Timeline[] =>
  timelines.filter((timeline) => isCollectionTimeline(timeline, collectionId));

export interface TimelineEventsVisibilityContext {
  /** every timeline the overrides may refer to, with all their events */
  timelines: Timeline[];
  /** the collection whose timelines are visible by default */
  collectionId: CollectionId | null | undefined;
}

interface ResolveOptions extends TimelineEventsVisibilityContext {
  visibility?: TimelineEventsVisibility;
  enabled?: boolean;
}

interface VisibilitySets {
  hiddenTimelineIds: Set<TimelineId>;
  shownTimelineIds: Set<TimelineId>;
  hiddenEventIds: Set<TimelineEventId>;
}

const toSets = (
  visibility: TimelineEventsVisibility | undefined,
): VisibilitySets => ({
  hiddenTimelineIds: new Set(visibility?.hidden_timeline_ids),
  shownTimelineIds: new Set(visibility?.shown_timeline_ids),
  hiddenEventIds: new Set(visibility?.hidden_event_ids),
});

const sortedIds = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);

/**
 * Empty lists are dropped so that "no overrides" is always `{}`.
 */
const fromSets = ({
  hiddenTimelineIds,
  shownTimelineIds,
  hiddenEventIds,
}: VisibilitySets): TimelineEventsVisibility => {
  const visibility: TimelineEventsVisibility = {};
  if (hiddenTimelineIds.size > 0) {
    visibility.hidden_timeline_ids = sortedIds(hiddenTimelineIds);
  }
  if (shownTimelineIds.size > 0) {
    visibility.shown_timeline_ids = sortedIds(shownTimelineIds);
  }
  if (hiddenEventIds.size > 0) {
    visibility.hidden_event_ids = sortedIds(hiddenEventIds);
  }
  return visibility;
};

const isTimelineVisible = (
  timeline: Timeline,
  { hiddenTimelineIds, shownTimelineIds }: VisibilitySets,
  collectionId: CollectionId | null | undefined,
) =>
  shownTimelineIds.has(timeline.id) ||
  (!hiddenTimelineIds.has(timeline.id) &&
    isCollectionTimeline(timeline, collectionId));

const getActiveEvents = (timeline: Timeline) =>
  (timeline.events ?? []).filter((event) => !event.archived);

/**
 * Events that should be drawn: every non-archived event of a visible timeline
 * that has not been hidden individually, sorted by timestamp.
 */
export const resolveVisibleTimelineEvents = ({
  timelines,
  collectionId,
  visibility,
  enabled = true,
}: ResolveOptions): TimelineEvent[] => {
  if (!enabled) {
    return [];
  }
  const sets = toSets(visibility);
  return _.sortBy(
    timelines
      .filter((timeline) => isTimelineVisible(timeline, sets, collectionId))
      .flatMap(getActiveEvents)
      .filter((event) => !sets.hiddenEventIds.has(event.id)),
    (event) => event.timestamp,
  );
};

export const isDefaultVisibility = (
  visibility: TimelineEventsVisibility | undefined,
): boolean =>
  !visibility?.hidden_timeline_ids?.length &&
  !visibility?.shown_timeline_ids?.length &&
  !visibility?.hidden_event_ids?.length;

const setTimelineVisible = (
  timeline: Timeline,
  isVisible: boolean,
  sets: VisibilitySets,
  collectionId: CollectionId | null | undefined,
) => {
  const isDefault = isCollectionTimeline(timeline, collectionId);
  if (isVisible) {
    sets.hiddenTimelineIds.delete(timeline.id);
    if (!isDefault) {
      sets.shownTimelineIds.add(timeline.id);
    }
  } else {
    sets.shownTimelineIds.delete(timeline.id);
    if (isDefault) {
      sets.hiddenTimelineIds.add(timeline.id);
    }
  }
  // per-event overrides only make sense inside a visible timeline
  timeline.events?.forEach((event) => sets.hiddenEventIds.delete(event.id));
};

const setTimelinesVisible = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  isVisible: boolean,
  context: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  timelines.forEach((timeline) =>
    setTimelineVisible(timeline, isVisible, sets, context.collectionId),
  );
  return fromSets(sets);
};

export const showTimelines = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  context: TimelineEventsVisibilityContext,
) => setTimelinesVisible(visibility, timelines, true, context);

export const hideTimelines = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  context: TimelineEventsVisibilityContext,
) => setTimelinesVisible(visibility, timelines, false, context);

const groupEventsByTimeline = (
  events: TimelineEvent[],
  timelines: Timeline[],
): Array<[Timeline, TimelineEvent[]]> => {
  const eventsByTimelineId = _.groupBy(events, (event) => event.timeline_id);
  return timelines
    .filter((timeline) => eventsByTimelineId[timeline.id])
    .map((timeline) => [timeline, eventsByTimelineId[timeline.id]]);
};

/**
 * Makes the given events visible. Showing an event of a hidden timeline turns
 * the timeline on and hides its other events, so only the requested ones
 * appear.
 */
export const showTimelineEvents = (
  visibility: TimelineEventsVisibility,
  events: TimelineEvent[],
  { timelines, collectionId }: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  groupEventsByTimeline(events, timelines).forEach(
    ([timeline, shownEvents]) => {
      const shownEventIds = new Set(shownEvents.map((event) => event.id));
      if (!isTimelineVisible(timeline, sets, collectionId)) {
        setTimelineVisible(timeline, true, sets, collectionId);
        getActiveEvents(timeline)
          .filter((event) => !shownEventIds.has(event.id))
          .forEach((event) => sets.hiddenEventIds.add(event.id));
      }
      shownEventIds.forEach((eventId) => sets.hiddenEventIds.delete(eventId));
    },
  );
  return fromSets(sets);
};

/**
 * Hides the given events. Once every event of a timeline is hidden the
 * override collapses to "timeline hidden", so events added later stay hidden
 * too.
 */
export const hideTimelineEvents = (
  visibility: TimelineEventsVisibility,
  events: TimelineEvent[],
  { timelines, collectionId }: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  groupEventsByTimeline(events, timelines).forEach(
    ([timeline, hiddenEvents]) => {
      if (!isTimelineVisible(timeline, sets, collectionId)) {
        return;
      }
      hiddenEvents.forEach((event) => sets.hiddenEventIds.add(event.id));
      const isEveryEventHidden = getActiveEvents(timeline).every((event) =>
        sets.hiddenEventIds.has(event.id),
      );
      if (isEveryEventHidden) {
        setTimelineVisible(timeline, false, sets, collectionId);
      }
    },
  );
  return fromSets(sets);
};

export interface AggregatedEventsVisibility {
  /** visible on every chart */
  visibleEventIds: TimelineEventId[];
  /** visible on some charts but not all */
  partiallyVisibleEventIds: TimelineEventId[];
}

export const aggregateVisibleEventIds = (
  visibleEventIdsPerChart: TimelineEventId[][],
): AggregatedEventsVisibility => {
  const visibleEventIds = _.intersection(...visibleEventIdsPerChart);
  return {
    visibleEventIds,
    partiallyVisibleEventIds: _.difference(
      _.union(...visibleEventIdsPerChart),
      visibleEventIds,
    ),
  };
};
