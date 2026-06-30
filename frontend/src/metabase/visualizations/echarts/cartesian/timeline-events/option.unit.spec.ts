import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { getTimelineEventsSelectionSeries } from "./option";
import type { TimelineEventsModel } from "./types";

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const timelineEventsModel: TimelineEventsModel = [
  {
    date: "2025-01-01T00:00:00Z",
    events: [createMockTimelineEvent({ id: 1 })],
  },
  {
    date: "2025-02-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 2 }),
      createMockTimelineEvent({ id: 3 }),
    ],
  },
];

describe("getTimelineEventsSelectionSeries", () => {
  it("returns null when nothing is selected", () => {
    expect(
      getTimelineEventsSelectionSeries(
        timelineEventsModel,
        [],
        renderingContext,
      ),
    ).toBeNull();
  });

  it("returns a markLine for each group containing a selected event", () => {
    const series = getTimelineEventsSelectionSeries(
      timelineEventsModel,
      [3],
      renderingContext,
    );

    expect(series?.markLine?.data).toEqual([{ xAxis: "2025-02-01T00:00:00Z" }]);
  });

  it("draws a line per selected date across distinct groups", () => {
    const series = getTimelineEventsSelectionSeries(
      timelineEventsModel,
      [1, 2],
      renderingContext,
    );

    expect(series?.markLine?.data).toEqual([
      { xAxis: "2025-01-01T00:00:00Z" },
      { xAxis: "2025-02-01T00:00:00Z" },
    ]);
  });

  it("uses two-point segments spanning the panel extent for split panels", () => {
    const series = getTimelineEventsSelectionSeries(
      timelineEventsModel,
      [1],
      renderingContext,
      { topY: 10, bottomY: 200 },
    );

    expect(series?.markLine?.data).toEqual([
      [
        { xAxis: "2025-01-01T00:00:00Z", y: 200 },
        { xAxis: "2025-01-01T00:00:00Z", y: 10, symbol: "none" },
      ],
    ]);
  });
});
