import type { TimeSeriesInterval } from "metabase/visualizations/echarts/cartesian/model/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { mergeOverlappingTimelineEventGroups } from "./model";
import type { TimelineEventGroup } from "./types";

const createMockTimelineEventGroup = (
  opts?: Partial<TimelineEventGroup>,
): TimelineEventGroup => ({
  date: "2024-01-01T00:00:00Z",
  events: [createMockTimelineEvent()],
  ...opts,
});

const createMockTimeSeriesInterval = (
  opts?: Partial<TimeSeriesInterval>,
): TimeSeriesInterval => ({
  count: 1,
  unit: "day",
  ...opts,
});

describe("mergeOverlappingTimelineEventGroups", () => {
  it("should not merge events that are far apart", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-10T00:00:00Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 1, unit: "day" });
    const intervalWidth = 80; // 800px / 10 days

    const result = mergeOverlappingTimelineEventGroups(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(2);
    expect(result[0].events).toEqual(eventGroups[0].events);
    expect(result[1].events).toEqual(eventGroups[1].events);
  });

  it("should merge events that are close together", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:09Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 1, unit: "minute" });
    const intervalWidth = 100; // 100px per minute

    const result = mergeOverlappingTimelineEventGroups(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].events).toEqual([
      ...eventGroups[0].events,
      ...eventGroups[1].events,
    ]);
  });

  it("should merge chips that would overlap given the wider chip width", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:30Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 1, unit: "minute" });
    // 25px apart: wider than the old 16px threshold but still under a chip
    // width, so the fixed-width chips would overlap and must merge.
    const intervalWidth = 50; // 0.5 min * 50px = 25px

    const result = mergeOverlappingTimelineEventGroups(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].events).toEqual([
      ...eventGroups[0].events,
      ...eventGroups[1].events,
    ]);
  });

  it("should correctly merge events when interval count is greater than 1", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-01T00:05:00Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-01T00:20:00Z",
        events: [createMockTimelineEvent({ id: 3 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 5, unit: "minute" });
    const intervalWidth = 13; // 13px per 5-minute interval

    const result = mergeOverlappingTimelineEventGroups(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(2);
    expect(result[0].events).toEqual([
      ...eventGroups[0].events,
      ...eventGroups[1].events,
    ]);
    expect(result[1].events).toEqual(eventGroups[2].events);
  });
});
