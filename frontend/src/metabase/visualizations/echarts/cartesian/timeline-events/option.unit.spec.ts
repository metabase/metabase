import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { getTimelineEventsSeries } from "./option";

const mockRenderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

describe("getTimelineEventsSeries", () => {
  it("returns null when the model is empty", () => {
    const result = getTimelineEventsSeries([], [], mockRenderingContext);
    expect(result).toBeNull();
  });

  it("positions the label at the bottom of the split panel (bottomY first, topY second) #74005", () => {
    const timelineEventsModel: TimelineEventsModel = [
      {
        date: "2027-10-01T00:00:00Z",
        events: [
          createMockTimelineEvent({ id: 1, name: "RC1" }),
          createMockTimelineEvent({ id: 2, name: "RC2" }),
        ],
      },
    ];

    const result = getTimelineEventsSeries(
      timelineEventsModel,
      [],
      mockRenderingContext,
      { topY: 0, bottomY: 300 },
    );

    expect(result).not.toBeNull();
    const markLineData = result!.markLine!.data as unknown[][];
    expect(markLineData).toHaveLength(1);

    const [startPoint, endPoint] = markLineData[0] as Array<{
      y: number;
      xAxis: string;
      symbol: string;
    }>;

    expect(startPoint.y).toBe(300);
    expect(startPoint.xAxis).toBe("2027-10-01T00:00:00Z");
    expect(startPoint.symbol).not.toBe("none");
    expect(endPoint.y).toBe(0);
    expect(endPoint.xAxis).toBe("2027-10-01T00:00:00Z");
    expect(endPoint.symbol).toBe("none");
  });
});
