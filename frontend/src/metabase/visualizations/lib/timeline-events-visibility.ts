import _ from "underscore";

import { getCollectionTimelines } from "metabase/common/utils/timelines";
import { dayjs } from "metabase/dayjs";
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
  VisualizationSettings,
} from "metabase-types/api";

interface ResolveOptions {
  timelines: Timeline[];
  visibility?: TimelineEventsVisibility;
  enabled?: boolean;
}

interface VisibilitySets {
  shownTimelineIds: Set<TimelineId>;
  hiddenEventIds: Set<TimelineEventId>;
}

const toSets = (
  visibility: TimelineEventsVisibility | undefined,
): VisibilitySets => ({
  shownTimelineIds: new Set(visibility?.["timeline.selected_timeline_ids"]),
  hiddenEventIds: new Set(visibility?.["timeline.excluded_timeline_event_ids"]),
});

const sortedIds = <T extends number>(ids: Iterable<T>): T[] =>
  [...ids].sort((a, b) => a - b);

const fromSets = ({
  shownTimelineIds,
  hiddenEventIds,
}: VisibilitySets): TimelineEventsVisibility => ({
  "timeline.selected_timeline_ids": sortedIds(shownTimelineIds),
  "timeline.excluded_timeline_event_ids": sortedIds(hiddenEventIds),
});

export const hasRecordedTimelineEventsVisibility = (
  settings: VisualizationSettings | undefined,
): boolean => settings?.["timeline.selected_timeline_ids"] != null;

// Returns the settings object itself so selectors memoized on it stay stable.
export const getRecordedTimelineEventsVisibility = (
  settings: VisualizationSettings | undefined,
): VisualizationSettings | undefined =>
  hasRecordedTimelineEventsVisibility(settings) ? settings : undefined;

const getActiveEvents = (timeline: Timeline) =>
  (timeline.events ?? []).filter((event) => !event.archived);

const sortByTimestamp = (events: TimelineEvent[]) =>
  _.sortBy(events, (event) => dayjs(event.timestamp).valueOf());

export const resolveVisibleTimelineEvents = ({
  timelines,
  visibility,
  enabled = true,
}: ResolveOptions): TimelineEvent[] => {
  if (!enabled) {
    return [];
  }
  const sets = toSets(visibility);
  return sortByTimestamp(
    timelines
      .filter((timeline) => sets.shownTimelineIds.has(timeline.id))
      .flatMap(getActiveEvents)
      .filter((event) => !sets.hiddenEventIds.has(event.id)),
  );
};

// Callers may hold a timeline whose events were filtered to the chart's x-axis;
// toggling must act on every event the timeline actually has.
const resolveTimeline = (timeline: Timeline, timelines: Timeline[]) =>
  timelines.find(({ id }) => id === timeline.id) ?? timeline;

const setTimelineVisible = (
  timeline: Timeline,
  isVisible: boolean,
  sets: VisibilitySets,
) => {
  if (isVisible) {
    sets.shownTimelineIds.add(timeline.id);
  } else {
    sets.shownTimelineIds.delete(timeline.id);
  }
  timeline.events?.forEach((event) => sets.hiddenEventIds.delete(event.id));
};

const setTimelinesVisible = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  isVisible: boolean,
  { timelines: allTimelines }: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  timelines.forEach((timeline) =>
    setTimelineVisible(
      resolveTimeline(timeline, allTimelines),
      isVisible,
      sets,
    ),
  );
  return fromSets(sets);
};

export const showTimelines = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  context: TimelineEventsVisibilityContext,
) => setTimelinesVisible(visibility, timelines, true, context);

export const getCollectionTimelinesVisibility = (
  timelines: Timeline[],
  collectionId: CollectionId | null | undefined,
) =>
  showTimelines({}, getCollectionTimelines(timelines, collectionId), {
    timelines,
  });

export const hideTimelines = (
  visibility: TimelineEventsVisibility,
  timelines: Timeline[],
  context: TimelineEventsVisibilityContext,
) => setTimelinesVisible(visibility, timelines, false, context);

const groupEventsByTimeline = (
  events: TimelineEvent[],
  timelines: Timeline[],
): Array<[Timeline, TimelineEvent[]]> => {
  const eventsByTimelineId = _.groupBy(events, "timeline_id");
  return timelines.flatMap((timeline) => {
    const group = eventsByTimelineId[timeline.id];
    return group ? [[timeline, group]] : [];
  });
};

export const showTimelineEvents = (
  visibility: TimelineEventsVisibility,
  events: TimelineEvent[],
  { timelines }: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  groupEventsByTimeline(events, timelines).forEach(
    ([timeline, shownEvents]) => {
      const shownEventIds = new Set(shownEvents.map((event) => event.id));
      if (!sets.shownTimelineIds.has(timeline.id)) {
        setTimelineVisible(timeline, true, sets);
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
  { timelines }: TimelineEventsVisibilityContext,
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  groupEventsByTimeline(events, timelines).forEach(
    ([timeline, hiddenEvents]) => {
      if (!sets.shownTimelineIds.has(timeline.id)) {
        return;
      }
      hiddenEvents.forEach((event) => sets.hiddenEventIds.add(event.id));
      const isEveryEventHidden = getActiveEvents(timeline).every((event) =>
        sets.hiddenEventIds.has(event.id),
      );
      if (isEveryEventHidden) {
        setTimelineVisible(timeline, false, sets);
      }
    },
  );
  return fromSets(sets);
};

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
