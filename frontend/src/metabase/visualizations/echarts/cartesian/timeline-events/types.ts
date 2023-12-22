import type { Dayjs } from "dayjs";
import type { TimelineEvent } from "metabase-types/api";

export type DateRange = [Dayjs, Dayjs];

export type TimelineEventGroup = {
  date: string;
  events: TimelineEvent[];
};

export type TimelineEventsModel = TimelineEventGroup[];
