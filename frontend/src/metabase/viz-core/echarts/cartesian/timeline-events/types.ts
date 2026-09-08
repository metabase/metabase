import type { TimelineEvent } from "metabase-types/api";

export type TimelineEventGroup = {
  date: string;
  events: TimelineEvent[];
};

export type TimelineEventCluster = {
  date: string;
  groups: TimelineEventGroup[];
};

export type TimelineEventsModel = TimelineEventCluster[];
