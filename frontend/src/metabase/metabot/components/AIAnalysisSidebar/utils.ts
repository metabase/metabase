import { getCollectionTimelines } from "metabase/common/utils/timelines";
import { isNotNull } from "metabase/utils/types";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

export const getTimelineEventsForAnalysis = (
  visibleTimelineEvents: TimelineEvent[],
  timelines: Timeline[],
  questionCollectionId: CollectionId,
) => {
  const sameCollectionTimelineEvents = getCollectionTimelines(
    timelines,
    questionCollectionId,
  )
    .flatMap((timeline) => timeline.events ?? [])
    .filter(isNotNull);

  const sameCollectionTimelineEventIds = new Set(
    sameCollectionTimelineEvents.map((e) => e.id),
  );

  const visibleEventsFromOtherCollections = visibleTimelineEvents.filter(
    (event) => !sameCollectionTimelineEventIds.has(event.id),
  );

  return [
    ...sameCollectionTimelineEvents,
    ...visibleEventsFromOtherCollections,
  ].map((event) => ({
    name: event.name,
    description: event.description ?? undefined,
    timestamp: event.timestamp,
  }));
};
