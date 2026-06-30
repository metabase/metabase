import type { EChartsType } from "echarts/core";

import { renderWithProviders, screen } from "__support__/ui";
import type { ChartLayout } from "metabase/visualizations/echarts/cartesian/layout/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventsBand } from "./TimelineEventsBand";

const createChartLayout = (): ChartLayout => ({
  padding: { top: 10, left: 50, bottom: 40, right: 10 },
  bounds: { top: 10, left: 50, bottom: 160, right: 450 },
  boundaryWidth: 400,
  outerWidth: 500,
  outerHeight: 200,
  axisEnabledSetting: true,
  panelGap: 0,
  ticksDimensions: {
    yTicksWidthLeft: 0,
    yTicksWidthRight: 0,
    xTicksHeight: 40,
    firstXTickWidth: 0,
    lastXTickWidth: 0,
    getXTickWidth: () => 0,
  },
});

const createChartInstance = (
  pixelByDate: Record<string, number>,
): EChartsType =>
  ({
    convertToPixel: (_finder: unknown, value: string) =>
      pixelByDate[value] ?? NaN,
    on: jest.fn(),
    off: jest.fn(),
  }) as unknown as EChartsType;

const timelineEventsModel: TimelineEventsModel = [
  {
    date: "2025-01-01T00:00:00Z",
    events: [createMockTimelineEvent({ id: 1, name: "First" })],
  },
  {
    date: "2025-02-01T00:00:00Z",
    events: [createMockTimelineEvent({ id: 2, name: "Second" })],
  },
];

interface SetupOpts {
  chartInstance?: EChartsType;
  timelineEventsModel?: TimelineEventsModel | null;
  selectedTimelineEventIds?: number[];
}

const setup = (opts: SetupOpts = {}) => {
  const { timelineEventsModel: model = timelineEventsModel } = opts;
  // Using `in` so an explicit `chartInstance: undefined` is honored rather than
  // falling back to the default (a destructuring default would override it).
  const chartInstance =
    "chartInstance" in opts
      ? opts.chartInstance
      : createChartInstance({
          "2025-01-01T00:00:00Z": 120,
          "2025-02-01T00:00:00Z": 300,
        });

  renderWithProviders(
    <TimelineEventsBand
      chartInstance={chartInstance}
      chartSize={{ width: 500, height: 200 }}
      timelineEventsModel={model}
      chartLayout={createChartLayout()}
      xAxisIndex={0}
      selectedTimelineEventIds={opts.selectedTimelineEventIds}
    />,
  );
};

describe("TimelineEventsBand", () => {
  it("renders a chip per visible event group", () => {
    setup();
    expect(screen.getByTestId("timeline-events-band")).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-event-chip")).toHaveLength(2);
  });

  it("marks the chip for a selected event group as selected", () => {
    setup({ selectedTimelineEventIds: [2] });
    const chips = screen.getAllByTestId("timeline-event-chip");
    expect(chips[0]).toHaveAttribute("data-selected", "false");
    expect(chips[1]).toHaveAttribute("data-selected", "true");
  });

  it("renders nothing without a chart instance", () => {
    setup({ chartInstance: undefined });
    expect(
      screen.queryByTestId("timeline-events-band"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing without a timeline events model", () => {
    setup({ timelineEventsModel: null });
    expect(
      screen.queryByTestId("timeline-events-band"),
    ).not.toBeInTheDocument();
  });
});
