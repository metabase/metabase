import { Event, EventTimeline } from "../event";
import { createMockUser } from "./user";

export const createMockEvent = ({
  id = 1,
  timeline_id = 1,
  name = "Christmas",
  icon = "star",
  date = new Date().toISOString(),
  creator = createMockUser(),
  created_at = new Date().toISOString(),
  ...rest
}: Partial<Event> = {}) => ({
  id,
  timeline_id,
  name,
  icon,
  date,
  creator,
  created_at,
  ...rest,
});

export const createMockEventTimeline = ({
  id = 1,
  collection_id = 1,
  name = "Product launches",
  description = "Dates when new releases have gone out",
  default_icon = "star",
  archived = false,
  events = [],
  ...rest
}: Partial<EventTimeline> = {}): EventTimeline => ({
  id,
  collection_id,
  name,
  description,
  default_icon,
  archived,
  events,
  ...rest,
});
