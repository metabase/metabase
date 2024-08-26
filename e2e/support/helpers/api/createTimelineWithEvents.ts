import {
  createTimeline,
  createTimelineEvent,
  cypressWaitAll,
} from "e2e/support/helpers";
import type {
  CreateTimelineEventRequest,
  CreateTimelineRequest,
} from "metabase-types/api";

export const createTimelineWithEvents = ({
  timeline,
  events,
}: {
  timeline: CreateTimelineRequest;
  events: CreateTimelineEventRequest[];
}) => {
  return createTimeline(timeline).then(({ body: timeline }) => {
    return cypressWaitAll(
      events.map(query =>
        createTimelineEvent({ ...query, timeline_id: timeline.id }),
      ),
    ).then(events => {
      return {
        timeline,
        events,
      };
    });
  });
};
