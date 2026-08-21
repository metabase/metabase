import userEvent from "@testing-library/user-event";
import type { EChartsType } from "echarts/core";

import { createMockChartLayout } from "__support__/echarts";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventsBand } from "./TimelineEventsBand";

const createChartInstance = (
  pixelByDate: Record<string, number>,
): EChartsType =>
  // the band only calls convertToPixel and the event methods, so a stub suffices
  ({
    convertToPixel: (_finder: unknown, value: string) =>
      pixelByDate[value] ?? NaN,
    on: jest.fn(),
    off: jest.fn(),
  }) as unknown as EChartsType;

const timelineEventsModel: TimelineEventsModel = [
  {
    date: "2025-01-01T00:00:00Z",
    groups: [
      {
        date: "2025-01-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 1, name: "First" })],
      },
    ],
  },
  {
    date: "2025-02-01T00:00:00Z",
    groups: [
      {
        date: "2025-02-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 2, name: "Second" })],
      },
    ],
  },
];

const stackedTimelineEventsModel: TimelineEventsModel = [
  timelineEventsModel[0],
  {
    date: "2025-02-01T00:00:00Z",
    groups: [
      {
        date: "2025-02-01T00:00:00Z",
        events: [createMockTimelineEvent({ id: 2, name: "Stack A" })],
      },
      {
        date: "2025-02-02T00:00:00Z",
        events: [createMockTimelineEvent({ id: 3, name: "Stack B" })],
      },
    ],
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

  const onGroupHover = jest.fn();

  renderWithProviders(
    <TimelineEventsBand
      chartInstance={chartInstance}
      chartSize={{ width: 500, height: 200 }}
      timelineEventsModel={model}
      chartLayout={createMockChartLayout({
        padding: { top: 10, left: 50, bottom: 40, right: 10 },
        bounds: { top: 10, left: 50, bottom: 160, right: 450 },
        boundaryWidth: 400,
        outerWidth: 500,
        outerHeight: 200,
        ticksDimensions: { xTicksHeight: 40, getXTickWidth: () => 0 },
      })}
      xAxisIndex={0}
      selectedTimelineEventIds={opts.selectedTimelineEventIds}
      onGroupHover={onGroupHover}
    />,
  );

  return { onGroupHover };
};

describe("TimelineEventsBand", () => {
  it("renders a chip per visible event cluster", () => {
    setup();
    expect(screen.getByTestId("timeline-events-band")).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-event-chip")).toHaveLength(2);
    expect(
      screen.queryByTestId("timeline-event-stack"),
    ).not.toBeInTheDocument();
  });

  it("marks the chip for a selected event cluster as selected", () => {
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

  describe("stacks", () => {
    it("renders a collapsed stack with a member chip per data point", () => {
      setup({ timelineEventsModel: stackedTimelineEventsModel });

      const stack = screen.getByTestId("timeline-event-stack");
      expect(stack).toHaveAttribute("data-expanded", "false");
      expect(screen.getByLabelText("Stack A")).toBeInTheDocument();
      expect(screen.getByLabelText("Stack B")).toBeInTheDocument();
    });

    it("expands on member hover, hides other chips, and reports no hover while collapsed", async () => {
      const { onGroupHover } = setup({
        timelineEventsModel: stackedTimelineEventsModel,
      });

      await userEvent.hover(screen.getByLabelText("Stack B"));

      expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
        "data-expanded",
        "true",
      );
      expect(screen.getByLabelText("First")).toHaveAttribute(
        "data-hidden",
        "true",
      );
      expect(onGroupHover).not.toHaveBeenCalled();
    });

    it("reports the hovered member group once the stack is spread", async () => {
      const { onGroupHover } = setup({
        timelineEventsModel: stackedTimelineEventsModel,
      });

      await userEvent.hover(screen.getByLabelText("Stack B"));
      await userEvent.hover(screen.getByLabelText("Stack A"));

      expect(onGroupHover).toHaveBeenLastCalledWith(
        stackedTimelineEventsModel[1].groups[0],
      );
    });

    it("collapses and unhides other chips after the pointer leaves", async () => {
      setup({ timelineEventsModel: stackedTimelineEventsModel });

      await userEvent.hover(screen.getByLabelText("Stack B"));
      expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
        "data-expanded",
        "true",
      );

      await userEvent.unhover(screen.getByLabelText("Stack B"));

      await waitFor(() => {
        expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
          "data-expanded",
          "false",
        );
      });
      expect(screen.getByLabelText("First")).toHaveAttribute(
        "data-hidden",
        "false",
      );
    });

    it("collapses when the pointer moves outside after visiting a member popover", async () => {
      setup({ timelineEventsModel: stackedTimelineEventsModel });

      await userEvent.hover(screen.getByLabelText("Stack B"));
      await userEvent.hover(screen.getByLabelText("Stack A"));
      expect(
        await screen.findByTestId("timeline-event-popover"),
      ).toBeInTheDocument();

      fireEvent.mouseOver(document.body);

      await waitFor(() => {
        expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
          "data-expanded",
          "false",
        );
      });
    });

    it("shows the selection ring on the collapsed top chip when a covered member is selected", () => {
      setup({
        timelineEventsModel: stackedTimelineEventsModel,
        selectedTimelineEventIds: [2],
      });

      expect(screen.getByLabelText("Stack B")).toHaveAttribute(
        "data-selected",
        "true",
      );
    });
  });
});
