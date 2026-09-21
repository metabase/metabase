import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { getTimelineEventSettings } from "./timelineEvents";

const event1 = createMockTimelineEvent({ id: 101, timeline_id: 1 });
const event2 = createMockTimelineEvent({ id: 102, timeline_id: 1 });
const event3 = createMockTimelineEvent({ id: 103, timeline_id: 1 });

const event4 = createMockTimelineEvent({ id: 201, timeline_id: 2 });
const event5 = createMockTimelineEvent({ id: 202, timeline_id: 2 });

const timeline1 = createMockTimeline({
  id: 1,
  events: [event1, event2, event3],
});

const timeline2 = createMockTimeline({
  id: 2,
  events: [event4, event5],
});

const timelineNoEvents = createMockTimeline({
  id: 3,
  events: undefined,
});

describe("getTimelineEventSettings", () => {
  it("should return empty arrays when no events are selected", () => {
    expect(getTimelineEventSettings([timeline1, timeline2], [])).toEqual({
      "timeline.selected_timeline_ids": [],
      "timeline.excluded_timeline_event_ids": [],
    });
  });

  it("should return empty arrays when timelines are empty", () => {
    expect(getTimelineEventSettings([], [101, 201])).toEqual({
      "timeline.selected_timeline_ids": [],
      "timeline.excluded_timeline_event_ids": [],
    });
  });

  it("should select a timeline with no exclusions when all its events are selected", () => {
    const result = getTimelineEventSettings([timeline1], [101, 102, 103]);

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1],
      "timeline.excluded_timeline_event_ids": [],
    });
  });

  it("should exclude unselected events within a selected timeline", () => {
    const result = getTimelineEventSettings([timeline1], [101]);

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1],
      "timeline.excluded_timeline_event_ids": [102, 103],
    });
  });

  it("should handle multiple timelines independently", () => {
    const result = getTimelineEventSettings([timeline1, timeline2], [101, 201]);

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1, 2],
      "timeline.excluded_timeline_event_ids": [102, 103, 202],
    });
  });

  it("should skip timelines with no selected events", () => {
    const result = getTimelineEventSettings([timeline1, timeline2], [201, 202]);

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [2],
      "timeline.excluded_timeline_event_ids": [],
    });
  });

  it("should skip timelines with undefined events", () => {
    const result = getTimelineEventSettings(
      [timelineNoEvents, timeline1],
      [101, 102, 103],
    );

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1],
      "timeline.excluded_timeline_event_ids": [],
    });
  });

  it("should ignore selected event IDs that don't belong to any timeline", () => {
    const result = getTimelineEventSettings([timeline1], [101, 999]);

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1],
      "timeline.excluded_timeline_event_ids": [102, 103],
    });
  });

  it("should select all timelines when all events across all timelines are selected", () => {
    const result = getTimelineEventSettings(
      [timeline1, timeline2],
      [101, 102, 103, 201, 202],
    );

    expect(result).toEqual({
      "timeline.selected_timeline_ids": [1, 2],
      "timeline.excluded_timeline_event_ids": [],
    });
  });
});
