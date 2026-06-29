import type { EChartsType } from "echarts/core";

import type { ChartBoundsCoords } from "metabase/visualizations/echarts/cartesian/layout/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import {
  getPositionedTimelineEventGroups,
  getTimelineEventGroupIconName,
} from "./utils";

const BOUNDS: ChartBoundsCoords = { top: 0, bottom: 100, left: 50, right: 450 };

const createChartInstance = (
  pixelByDate: Record<string, number | number[]>,
): EChartsType =>
  ({
    convertToPixel: (_finder: unknown, value: string) =>
      pixelByDate[value] ?? NaN,
  }) as unknown as EChartsType;

describe("TimelineEventsBand utils", () => {
  describe("getTimelineEventGroupIconName", () => {
    it("uses the event's icon for a single event", () => {
      expect(
        getTimelineEventGroupIconName({
          date: "2025-01-01T00:00:00Z",
          events: [createMockTimelineEvent({ icon: "cloud" })],
        }),
      ).toBe("cloud");
    });
  });

  describe("getPositionedTimelineEventGroups", () => {
    const timelineEventsModel: TimelineEventsModel = [
      {
        date: "2025-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1, name: "In range" })],
      },
      {
        date: "2025-02-01T00:00:00Z",
        events: [
          createMockTimelineEvent({ id: 2, name: "Cluster a" }),
          createMockTimelineEvent({ id: 3, name: "Cluster b" }),
        ],
      },
      {
        date: "2025-03-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 4, name: "Out of range" })],
      },
    ];

    it("maps groups to pixel positions and drops out-of-range groups", () => {
      const chartInstance = createChartInstance({
        "2025-01-01T00:00:00Z": 120,
        "2025-02-01T00:00:00Z": 300,
        "2025-03-01T00:00:00Z": 999, // beyond bounds.right
      });

      const positioned = getPositionedTimelineEventGroups({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned).toHaveLength(2);
      expect(positioned[0]).toMatchObject({
        x: 120,
        count: 1,
        iconName: "star",
      });
      expect(positioned[1]).toMatchObject({
        x: 300,
        count: 2,
        iconName: "star",
      });
    });

    it("drops groups whose pixel position is NaN", () => {
      const chartInstance = createChartInstance({});

      const positioned = getPositionedTimelineEventGroups({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned).toHaveLength(0);
    });

    it("reads the first coordinate when convertToPixel returns an array", () => {
      const chartInstance = createChartInstance({
        "2025-01-01T00:00:00Z": [200, 80],
        "2025-02-01T00:00:00Z": NaN,
        "2025-03-01T00:00:00Z": NaN,
      });

      const positioned = getPositionedTimelineEventGroups({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned).toHaveLength(1);
      expect(positioned[0].x).toBe(200);
    });
  });
});
