import type {
  CreateTimelineRequest,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

import { cypressWaitAll } from "../e2e-misc-helpers";

import { createTimeline } from "./createTimeline";
import {
  type TimelineEventDetails,
  createTimelineEvent,
} from "./createTimelineEvent";

export const createTimelineWithEvents = ({
  timeline,
  events,
}: {
  timeline: CreateTimelineRequest;
  events: Omit<TimelineEventDetails, "timeline_id">[];
}): Cypress.Chainable<{
  timeline: Timeline;
  events: TimelineEvent[];
}> => {
  return createTimeline(timeline).then(({ body: timeline }) => {
    return cypressWaitAll(
      events.map((query) =>
        createTimelineEvent({ ...query, timeline_id: timeline.id }),
      ),
    ).then((responses) => {
      return {
        timeline,
        events: responses.map(({ body }) => body),
      };
    });
  });
};
