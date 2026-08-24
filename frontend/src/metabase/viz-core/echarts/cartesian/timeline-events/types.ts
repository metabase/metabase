import type { TimelineEvent } from "metabase-types/api";

export type TimelineEventGroup = {
  date: string;
  events: TimelineEvent[];
};

export type TimelineEventsModel = TimelineEventGroup[];
