import dayjs from "dayjs";
import _ from "underscore";

import { isCollectionTimeline } from "metabase/common/utils/timelines";
import type {
  AggregatedEventsVisibility,
  TimelineEventsVisibilityContext,
} from "metabase/visualizations/types";
import type {
  CollectionId,
  Timeline,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
  TimelineId,
} from "metabase-types/api";

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

const sortedIds = <T extends number>(ids: Iterable<T>): T[] =>
  [...ids].sort((a, b) => a - b);

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

const sortByTimestamp = (events: TimelineEvent[]) =>
  _.sortBy(events, (event) => dayjs(event.timestamp).valueOf());

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
  return sortByTimestamp(
    timelines
      .filter((timeline) => isTimelineVisible(timeline, sets, collectionId))
      .flatMap(getActiveEvents)
      .filter((event) => !sets.hiddenEventIds.has(event.id)),
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
  const eventsByTimelineId = new Map<TimelineId, TimelineEvent[]>();
  events.forEach((event) => {
    const group = eventsByTimelineId.get(event.timeline_id);
    if (group) {
      group.push(event);
    } else {
      eventsByTimelineId.set(event.timeline_id, [event]);
    }
  });
  return timelines.flatMap((timeline) => {
    const group = eventsByTimelineId.get(timeline.id);
    return group ? [[timeline, group]] : [];
  });
};

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

export const aggregateVisibleEventIds = (
  visibleEventIdsPerChart: TimelineEventId[][],
): AggregatedEventsVisibility => {
  const [firstChartEventIds = [], ...otherCharts] = visibleEventIdsPerChart;
  const otherChartSets = otherCharts.map((eventIds) => new Set(eventIds));
  const visibleEventIds = [...new Set(firstChartEventIds)].filter((eventId) =>
    otherChartSets.every((set) => set.has(eventId)),
  );
  const visibleSet = new Set(visibleEventIds);
  const partiallyVisibleEventIds = [
    ...new Set(visibleEventIdsPerChart.flat()),
  ].filter((eventId) => !visibleSet.has(eventId));
  return { visibleEventIds, partiallyVisibleEventIds };
};
