import type {
  CreateTimelineEventRequest,
  CreateTimelineRequest,
} from "metabase-types/api";

import { cypressWaitAll } from "../e2e-misc-helpers";

import { createTimeline } from "./createTimeline";
import { createTimelineEvent } from "./createTimelineEvent";

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
