import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { getFocusedTimelines } from "./TimelineSidebar";

const timelineA = createMockTimeline({
  id: 1,
  name: "Releases",
  events: [
    createMockTimelineEvent({ id: 10, name: "A1" }),
    createMockTimelineEvent({ id: 11, name: "A2" }),
  ],
});

const timelineB = createMockTimeline({
  id: 2,
  name: "Incidents",
  events: [
    createMockTimelineEvent({ id: 20, name: "B1" }),
    createMockTimelineEvent({ id: 21, name: "B2" }),
  ],
});

describe("getFocusedTimelines", () => {
  const timelines = [timelineA, timelineB];

  it("returns all timelines unchanged when focus is null", () => {
    expect(getFocusedTimelines(timelines, null)).toBe(timelines);
  });

  it("keeps only the focused events within a timeline", () => {
    const result = getFocusedTimelines(timelines, [10]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].events?.map((event) => event.id)).toEqual([10]);
  });

  it("keeps focused events across multiple timelines and drops empty ones", () => {
    const result = getFocusedTimelines(timelines, [11, 20]);

    expect(result.map((timeline) => timeline.id)).toEqual([1, 2]);
    expect(result[0].events?.map((event) => event.id)).toEqual([11]);
    expect(result[1].events?.map((event) => event.id)).toEqual([20]);
  });

  it("returns no timelines when none of the focused events match", () => {
    expect(getFocusedTimelines(timelines, [999])).toEqual([]);
  });
});
