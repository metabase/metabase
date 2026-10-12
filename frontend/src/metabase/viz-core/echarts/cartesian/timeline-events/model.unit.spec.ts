import { createMockTimelineEvent } from "metabase-types/api/mocks";

import type { TimeSeriesInterval } from "../model/types";

import { buildTimelineEventClusters } from "./model";
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

describe("buildTimelineEventClusters", () => {
  it("should keep groups that are far apart as separate clusters", () => {
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

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(2);
    expect(result[0].groups).toEqual([eventGroups[0]]);
    expect(result[1].groups).toEqual([eventGroups[1]]);
  });

  it("should cluster groups that are close together, preserving member groups", () => {
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

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(eventGroups[0].date);
    expect(result[0].groups).toEqual(eventGroups);
  });

  it("should cluster chips that would overlap given the chip width", () => {
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
    // width, so the fixed-width chips would overlap and must cluster.
    const intervalWidth = 50; // 0.5 min * 50px = 25px

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].groups).toEqual(eventGroups);
  });

  it("should correctly cluster groups when interval count is greater than 1", () => {
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

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(2);
    expect(result[0].groups).toEqual([eventGroups[0], eventGroups[1]]);
    expect(result[1].groups).toEqual([eventGroups[2]]);
  });

  it("should fold a continuous run into one cluster even when it spans more than minDistance from the anchor", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-02T00:00:00Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-03T00:00:00Z",
        events: [createMockTimelineEvent({ id: 3 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 1, unit: "day" });
    // each step is 20px < minDistance, but the full run spans 40px
    const intervalWidth = 20;

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].groups).toEqual(eventGroups);
  });

  it("should anchor a cluster at its earliest group's date", () => {
    const eventGroups: TimelineEventGroup[] = [
      createMockTimelineEventGroup({
        date: "2024-01-03T00:00:00Z",
        events: [createMockTimelineEvent({ id: 2 })],
      }),
      createMockTimelineEventGroup({
        date: "2024-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1 })],
      }),
    ];

    const interval = createMockTimeSeriesInterval({ count: 1, unit: "day" });
    const intervalWidth = 10; // 2 days apart = 20px < minDistance

    const result = buildTimelineEventClusters(
      eventGroups,
      interval,
      intervalWidth,
    );

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2024-01-01T00:00:00Z");
    expect(result[0].groups.map(({ date }) => date)).toEqual([
      "2024-01-01T00:00:00Z",
      "2024-01-03T00:00:00Z",
    ]);
  });
});
