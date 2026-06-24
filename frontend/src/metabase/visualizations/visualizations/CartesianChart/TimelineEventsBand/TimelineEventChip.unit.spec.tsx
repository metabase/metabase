import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventChip } from "./TimelineEventChip";
import type { PositionedTimelineEventGroup } from "./utils";

const singleGroup: PositionedTimelineEventGroup = {
  group: {
    date: "2025-01-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 1, name: "Release v1", icon: "cloud" }),
    ],
  },
  x: 100,
  iconName: "cloud",
  count: 1,
};

const twoGroup: PositionedTimelineEventGroup = {
  group: {
    date: "2025-02-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 2, name: "Event A" }),
      createMockTimelineEvent({ id: 3, name: "Event B" }),
    ],
  },
  x: 200,
  iconName: "star",
  count: 2,
};

const manyGroup: PositionedTimelineEventGroup = {
  group: {
    date: "2025-03-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 4, name: "Many 1" }),
      createMockTimelineEvent({ id: 5, name: "Many 2" }),
      createMockTimelineEvent({ id: 6, name: "Many 3" }),
      createMockTimelineEvent({ id: 7, name: "Many 4" }),
    ],
  },
  x: 300,
  iconName: "star",
  count: 4,
};

interface SetupOpts {
  positioned?: PositionedTimelineEventGroup;
  withOpenTimelines?: boolean;
}

const setup = ({
  positioned = singleGroup,
  withOpenTimelines = true,
}: SetupOpts = {}) => {
  const onOpenTimelines = jest.fn();

  renderWithProviders(
    <TimelineEventChip
      positioned={positioned}
      centerY={120}
      onOpenTimelines={withOpenTimelines ? onOpenTimelines : undefined}
    />,
  );

  return { onOpenTimelines };
};

describe("TimelineEventChip", () => {
  it("renders the event count for a cluster", () => {
    setup({ positioned: manyGroup });
    expect(screen.getByTestId("timeline-event-chip")).toHaveTextContent("4");
  });

  it("opens a single-event popover on hover without a 'See all' link", async () => {
    setup({ positioned: singleGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Release v1")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });

  it("lists all events on hover for a small cluster", async () => {
    setup({ positioned: twoGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Event A")).toBeInTheDocument();
    expect(screen.getByText("Event B")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });

  it("truncates to three events and shows 'See all' for more than three", async () => {
    setup({ positioned: manyGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Many 1")).toBeInTheDocument();
    expect(screen.getByText("Many 3")).toBeInTheDocument();
    expect(screen.queryByText("Many 4")).not.toBeInTheDocument();
    expect(screen.getByText("See all")).toBeInTheDocument();
  });

  it("calls onOpenTimelines from the 'See all' action", async () => {
    const { onOpenTimelines } = setup({ positioned: manyGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));
    await userEvent.click(await screen.findByText("See all"));

    expect(onOpenTimelines).toHaveBeenCalled();
  });

  it("hides 'See all' when onOpenTimelines is not provided", async () => {
    setup({ positioned: manyGroup, withOpenTimelines: false });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Many 1")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });
});
