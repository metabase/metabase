import type {
  ChartBoundsCoords,
  EChartsType,
  TimelineEventsModel,
} from "metabase/viz-core";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import {
  arePositionedClustersEqual,
  getPositionedTimelineEventClusters,
  getTimelineEventGroupIconName,
} from "./utils";

const BOUNDS: ChartBoundsCoords = { top: 0, bottom: 100, left: 50, right: 450 };

const createChartInstance = (
  pixelByDate: Record<string, number | number[]>,
): EChartsType =>
  // the positioning code only calls convertToPixel, so a stub suffices
  ({
    convertToPixel: (_finder: unknown, value: string) =>
      pixelByDate[value] ?? NaN,
  }) as unknown as EChartsType;

describe("TimelineEventsBand utils", () => {
  describe("getTimelineEventGroupIconName", () => {
    it("maps the event's icon to its 12px display glyph", () => {
      expect(
        getTimelineEventGroupIconName({
          date: "2025-01-01T00:00:00Z",
          events: [createMockTimelineEvent({ icon: "cloud" })],
        }),
      ).toBe("cloud_12");
    });

    it("falls back to the standard glyph when there is no 12px variant", () => {
      expect(
        getTimelineEventGroupIconName({
          date: "2025-01-01T00:00:00Z",
          events: [createMockTimelineEvent({ icon: "star" })],
        }),
      ).toBe("star");
    });

    it("falls back to the default icon for an empty group", () => {
      expect(
        getTimelineEventGroupIconName({
          date: "2025-01-01T00:00:00Z",
          events: [],
        }),
      ).toBe("star");
    });
  });

  describe("getPositionedTimelineEventClusters", () => {
    const timelineEventsModel: TimelineEventsModel = [
      {
        date: "2025-01-01T00:00:00Z",
        groups: [
          {
            date: "2025-01-01T00:00:00Z",
            events: [createMockTimelineEvent({ id: 1, name: "In range" })],
          },
        ],
      },
      {
        date: "2025-02-01T00:00:00Z",
        groups: [
          {
            date: "2025-02-01T00:00:00Z",
            events: [createMockTimelineEvent({ id: 2, name: "Cluster a" })],
          },
          {
            date: "2025-02-02T00:00:00Z",
            events: [createMockTimelineEvent({ id: 3, name: "Cluster b" })],
          },
        ],
      },
      {
        date: "2025-03-01T00:00:00Z",
        groups: [
          {
            date: "2025-03-01T00:00:00Z",
            events: [createMockTimelineEvent({ id: 4, name: "Out of range" })],
          },
        ],
      },
    ];

    it("maps clusters to member pixel positions and drops out-of-range clusters", () => {
      const chartInstance = createChartInstance({
        "2025-01-01T00:00:00Z": 120,
        "2025-02-01T00:00:00Z": 300,
        "2025-02-02T00:00:00Z": 320,
        "2025-03-01T00:00:00Z": 999, // beyond bounds.right
      });

      const positioned = getPositionedTimelineEventClusters({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned).toEqual([
        { cluster: timelineEventsModel[0], memberXs: [120] },
        { cluster: timelineEventsModel[1], memberXs: [300, 320] },
      ]);
    });

    it("falls back to the cluster anchor for members that cannot be positioned", () => {
      const chartInstance = createChartInstance({
        "2025-01-01T00:00:00Z": 120,
        "2025-02-01T00:00:00Z": 300,
        // no entry for the second member of the second cluster
      });

      const positioned = getPositionedTimelineEventClusters({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned[1].memberXs).toEqual([300, 300]);
    });

    it("clamps member positions into the plot bounds", () => {
      const chartInstance = createChartInstance({
        "2025-01-01T00:00:00Z": 120,
        "2025-02-01T00:00:00Z": 440,
        "2025-02-02T00:00:00Z": 470, // beyond bounds.right
      });

      const positioned = getPositionedTimelineEventClusters({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned[1].memberXs).toEqual([440, 450]);
    });

    it("drops clusters whose pixel position is NaN", () => {
      const chartInstance = createChartInstance({});

      const positioned = getPositionedTimelineEventClusters({
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

      const positioned = getPositionedTimelineEventClusters({
        timelineEventsModel,
        chartInstance,
        plotBounds: BOUNDS,
        xAxisIndex: 0,
      });

      expect(positioned).toHaveLength(1);
      expect(positioned[0].memberXs).toEqual([200]);
    });
  });

  describe("arePositionedClustersEqual", () => {
    const cluster = {
      date: "2025-01-01T00:00:00Z",
      groups: [
        {
          date: "2025-01-01T00:00:00Z",
          events: [createMockTimelineEvent({ id: 1 })],
        },
      ],
    };

    it("returns true for the same clusters at the same positions", () => {
      expect(
        arePositionedClustersEqual(
          [{ cluster, memberXs: [120] }],
          [{ cluster, memberXs: [120] }],
        ),
      ).toBe(true);
    });

    it("returns false when a member position changes", () => {
      expect(
        arePositionedClustersEqual(
          [{ cluster, memberXs: [120] }],
          [{ cluster, memberXs: [121] }],
        ),
      ).toBe(false);
    });

    it("returns false when the number of clusters changes", () => {
      expect(
        arePositionedClustersEqual([{ cluster, memberXs: [120] }], []),
      ).toBe(false);
    });
  });
});
