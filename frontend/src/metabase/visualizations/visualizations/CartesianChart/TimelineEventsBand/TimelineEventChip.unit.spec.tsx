import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";
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
};

interface SetupOpts {
  eventsGroup?: PositionedTimelineEventGroup;
  selectedEventIds?: TimelineEventId[];
  withCallbacks?: boolean;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

const setup = ({
  eventsGroup = singleGroup,
  selectedEventIds = [],
  withCallbacks = true,
  onSeeAllEvents,
}: SetupOpts = {}) => {
  const onOpenTimelines = jest.fn();
  const onSelectTimelineEvents = jest.fn();
  const onDeselectTimelineEvents = jest.fn();

  renderWithProviders(
    <TimelineEventChip
      eventsGroup={eventsGroup}
      centerY={120}
      selectedEventIds={selectedEventIds}
      onOpenTimelines={withCallbacks ? onOpenTimelines : undefined}
      onSelectTimelineEvents={
        withCallbacks ? onSelectTimelineEvents : undefined
      }
      onDeselectTimelineEvents={
        withCallbacks ? onDeselectTimelineEvents : undefined
      }
      onSeeAllEvents={onSeeAllEvents}
    />,
  );

  return { onOpenTimelines, onSelectTimelineEvents, onDeselectTimelineEvents };
};

describe("TimelineEventChip", () => {
  it("renders the event count for a cluster", () => {
    setup({ eventsGroup: manyGroup });
    expect(screen.getByTestId("timeline-event-chip")).toHaveTextContent("4");
  });

  it("marks the chip as selected when one of its events is selected", () => {
    setup({ eventsGroup: singleGroup, selectedEventIds: [1] });
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

  it("deselects the events when a fully selected chip is clicked", async () => {
    const {
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
      onOpenTimelines,
    } = setup({ eventsGroup: twoGroup, selectedEventIds: [2, 3] });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(onDeselectTimelineEvents).toHaveBeenCalled();
    expect(onSelectTimelineEvents).not.toHaveBeenCalled();
    // clears any sidebar focus so the full list returns
    expect(onOpenTimelines).toHaveBeenCalledWith();
  });

  it("selects the whole group when a partially selected cluster is clicked", async () => {
    const { onSelectTimelineEvents, onDeselectTimelineEvents } = setup({
      eventsGroup: twoGroup,
      selectedEventIds: [2],
    });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(onSelectTimelineEvents).toHaveBeenCalledWith(twoGroup.group.events);
    expect(onDeselectTimelineEvents).not.toHaveBeenCalled();
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

  it("shows 'See all' handing the cluster to onSeeAllEvents without making the chip clickable", async () => {
    const onSeeAllEvents = jest.fn();
    // No select/open callbacks — the Explorations wiring, where only
    // "See all" should act (a bare chip click must do nothing).
    const { onSelectTimelineEvents } = setup({
      eventsGroup: manyGroup,
      withCallbacks: false,
      onSeeAllEvents,
    });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));
    expect(onSelectTimelineEvents).not.toHaveBeenCalled();
    expect(onSeeAllEvents).not.toHaveBeenCalled();

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));
    await userEvent.click(await screen.findByText("See all"));

    expect(onSeeAllEvents).toHaveBeenCalledWith(manyGroup.group.events);
  });

  it("dismisses the popover after 'See all' is clicked", async () => {
    setup({ eventsGroup: manyGroup, onSeeAllEvents: jest.fn() });

    await userEvent.hover(screen.getByTestId("timeline-event-chip"));
    expect(
      await screen.findByTestId("timeline-event-popover"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("See all"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
  });
});
