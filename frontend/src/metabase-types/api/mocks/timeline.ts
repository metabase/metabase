import type {
  TimelineEvent,
  Timeline,
  TimelineData,
  TimelineEventData,
} from "../timeline";

import { createMockUserInfo } from "./user";

export const createMockTimeline = (opts?: Partial<Timeline>): Timeline => ({
  ...createMockTimelineData(opts),
  id: 1,
  collection_id: 1,
  ...opts,
});

export const createMockTimelineData = (
  opts?: Partial<TimelineData>,
): TimelineData => ({
  collection_id: 1,
  name: "Events",
  description: null,
  icon: "star",
  default: false,
  archived: false,
  ...opts,
});

export const createMockTimelineEvent = (
  opts?: Partial<TimelineEvent>,
): TimelineEvent => ({
  ...createMockTimelineEventData(opts),
  id: 1,
  timeline_id: 1,
  creator: createMockUserInfo(),
  created_at: "2021-12-01",
  ...opts,
});

export const createMockTimelineEventData = (
  opts?: Partial<TimelineEventData>,
): TimelineEventData => ({
  name: "Christmas",
  description: null,
  icon: "star",
  timestamp: "2021-12-25T00:00:00Z",
  timezone: "UTC",
  time_matters: false,
  archived: false,
  ...opts,
});
