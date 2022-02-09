import { Event, EventTimeline } from "../event";
import { createMockUser } from "./user";

export const createMockEvent = (opts?: Partial<Event>): Event => ({
  id: 1,
  timeline_id: 1,
  name: "Christmas",
  icon: "star",
  date: "2021-12-25",
  creator: createMockUser(),
  created_at: "2021-12-01",
  archived: false,
  ...opts,
});

export const createMockEventTimeline = (
  opts: Partial<EventTimeline>,
): EventTimeline => ({
  id: 1,
  collection_id: 1,
  name: "Events",
  description: "A timeline of events",
  default_icon: "star",
  archived: false,
  events: [],
  ...opts,
});
