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
  isSelected: false,
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
  isSelected: false,
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
  isSelected: false,
};

interface SetupOpts {
  eventsGroup?: PositionedTimelineEventGroup;
  withCallbacks?: boolean;
}

const setup = ({
  eventsGroup = singleGroup,
  withCallbacks = true,
}: SetupOpts = {}) => {
  const onOpenTimelines = jest.fn();
  const onSelectTimelineEvents = jest.fn();

  renderWithProviders(
    <TimelineEventChip
      eventsGroup={eventsGroup}
      centerY={120}
      onOpenTimelines={withCallbacks ? onOpenTimelines : undefined}
      onSelectTimelineEvents={
        withCallbacks ? onSelectTimelineEvents : undefined
      }
    />,
  );

  return { onOpenTimelines, onSelectTimelineEvents };
};

describe("TimelineEventChip", () => {
  it("renders the event count for a cluster", () => {
    setup({ eventsGroup: manyGroup });
    expect(screen.getByTestId("timeline-event-chip")).toHaveTextContent("4");
  });

  it("marks the chip as selected when the group is selected", () => {
    setup({ eventsGroup: { ...singleGroup, isSelected: true } });
    expect(screen.getByTestId("timeline-event-chip")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it("opens a single-event popover on hover without a 'See all' link", async () => {
    setup({ eventsGroup: singleGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Release v1")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });

  it("lists all events on hover for a small cluster", async () => {
    setup({ eventsGroup: twoGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Event A")).toBeInTheDocument();
    expect(screen.getByText("Event B")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });

  it("truncates to three events and shows 'See all' for more than three", async () => {
    setup({ eventsGroup: manyGroup });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Many 1")).toBeInTheDocument();
    expect(screen.getByText("Many 3")).toBeInTheDocument();
    expect(screen.queryByText("Many 4")).not.toBeInTheDocument();
    expect(screen.getByText("See all")).toBeInTheDocument();
  });

  it("opens the full sidebar (no focus) and selects the event when a single chip is clicked", async () => {
    const { onOpenTimelines, onSelectTimelineEvents } = setup({
      eventsGroup: singleGroup,
    });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(onOpenTimelines).toHaveBeenCalledWith(undefined);
    expect(onSelectTimelineEvents).toHaveBeenCalledWith(
      singleGroup.group.events,
    );
  });

  it("focuses the sidebar on the group and selects its events when a grouped chip is clicked", async () => {
    const { onOpenTimelines, onSelectTimelineEvents } = setup({
      eventsGroup: twoGroup,
    });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(onOpenTimelines).toHaveBeenCalledWith([2, 3]);
    expect(onSelectTimelineEvents).toHaveBeenCalledWith(twoGroup.group.events);
  });

  it("focuses the sidebar on the group and selects its events from 'See all'", async () => {
    const { onOpenTimelines, onSelectTimelineEvents } = setup({
      eventsGroup: manyGroup,
    });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));
    await userEvent.click(await screen.findByText("See all"));

    expect(onOpenTimelines).toHaveBeenCalledWith([4, 5, 6, 7]);
    expect(onSelectTimelineEvents).toHaveBeenCalledWith(manyGroup.group.events);
  });

  it("hides 'See all' and does not select in degraded contexts", async () => {
    setup({ eventsGroup: manyGroup, withCallbacks: false });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));
    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Many 1")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });
});
