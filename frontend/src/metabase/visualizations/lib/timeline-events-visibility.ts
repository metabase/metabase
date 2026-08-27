import _ from "underscore";

import { getCollectionTimelines } from "metabase/common/utils/timelines";
import { dayjs } from "metabase/dayjs";
import type { AggregatedEventsVisibility } from "metabase/visualizations/types";
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

// Returns the settings object itself so selectors memoized on it stay stable.
export const getRecordedTimelineEventsVisibility = (
  settings: VisualizationSettings | undefined,
): VisualizationSettings | undefined =>
  settings?.["timeline.selected_timeline_ids"] != null ? settings : undefined;

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

// Takes ids, not timelines: callers hold timelines whose events were filtered
// to a chart's x-axis, and toggling must act on every event a timeline has.
const setTimelinesVisible = (
  visibility: TimelineEventsVisibility,
  timelineIds: TimelineId[],
  isVisible: boolean,
  timelines: Timeline[],
): TimelineEventsVisibility => {
  const sets = toSets(visibility);
  const ids = new Set(timelineIds);
  timelines
    .filter((timeline) => ids.has(timeline.id))
    .forEach((timeline) => setTimelineVisible(timeline, isVisible, sets));
  return fromSets(sets);
};

export const showTimelines = (
  visibility: TimelineEventsVisibility,
  timelineIds: TimelineId[],
  timelines: Timeline[],
) => setTimelinesVisible(visibility, timelineIds, true, timelines);

export const hideTimelines = (
  visibility: TimelineEventsVisibility,
  timelineIds: TimelineId[],
  timelines: Timeline[],
) => setTimelinesVisible(visibility, timelineIds, false, timelines);

export const getCollectionTimelinesVisibility = (
  timelines: Timeline[],
  collectionId: CollectionId | null | undefined,
) =>
  showTimelines(
    {},
    getCollectionTimelines(timelines, collectionId).map(({ id }) => id),
    timelines,
  );

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
  timelines: Timeline[],
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
  timelines: Timeline[],
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
  const [firstChartEventIds = [], ...otherCharts] = visibleEventIdsPerChart;
  const otherChartSets = otherCharts.map((eventIds) => new Set(eventIds));
  const visibleEventIds = [...new Set(firstChartEventIds)].filter((eventId) =>
    otherChartSets.every((eventIdSet) => eventIdSet.has(eventId)),
  );
  const visibleSet = new Set(visibleEventIds);
  return {
    visibleEventIds,
    partiallyVisibleEventIds: [
      ...new Set(visibleEventIdsPerChart.flat()),
    ].filter((eventId) => !visibleSet.has(eventId)),
  };
};
