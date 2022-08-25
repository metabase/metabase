import { TimelineEvent, Timeline } from "../timeline";
import { createMockUser } from "./user";

export const createMockTimeline = (opts?: Partial<Timeline>): Timeline => ({
  id: 1,
  collection_id: 1,
  name: "Events",
  description: "A timeline of events",
  icon: "star",
  default: false,
  archived: false,
  ...opts,
});

export const createMockTimelineEvent = (
  opts?: Partial<TimelineEvent>,
): TimelineEvent => ({
  id: 1,
  timeline_id: 1,
  name: "Christmas",
  description: null,
  icon: "star",
  timestamp: "2021-12-25T00:00:00Z",
  timezone: "UTC",
  time_matters: false,
  creator: createMockUser(),
  created_at: "2021-12-01",
  archived: false,
  ...opts,
});
