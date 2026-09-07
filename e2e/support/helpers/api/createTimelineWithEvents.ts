import type {
  CreateTimelineEventRequest,
  CreateTimelineRequest,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

import { cypressWaitAll } from "../e2e-misc-helpers";

import { createTimeline } from "./createTimeline";
import { createTimelineEvent } from "./createTimelineEvent";

export const createTimelineWithEvents = ({
  timeline,
  events,
}: {
  timeline: CreateTimelineRequest;
  events: Partial<Omit<CreateTimelineEventRequest, "timeline_id">>[];
}): Cypress.Chainable<{
  timeline: Timeline;
  events: TimelineEvent[];
}> => {
  return createTimeline(timeline).then(({ body: timeline }) => {
    return cypressWaitAll(
      events.map((query) =>
        createTimelineEvent({ ...query, timeline_id: timeline.id }),
      ),
    ).then((events) => {
      return {
        timeline,
        events,
      };
    });
  });
};
