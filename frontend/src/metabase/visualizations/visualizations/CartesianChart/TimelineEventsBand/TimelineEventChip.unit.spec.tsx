import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TimelineEventGroup } from "metabase/viz-core";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventChip } from "./TimelineEventChip";

interface ChipFixture {
  group: TimelineEventGroup;
  x: number;
}

const singleGroup: ChipFixture = {
  group: {
    date: "2025-01-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 1, name: "Release v1", icon: "cloud" }),
    ],
  },
  x: 100,
};

const twoGroup: ChipFixture = {
  group: {
    date: "2025-02-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 2, name: "Event A" }),
      createMockTimelineEvent({ id: 3, name: "Event B" }),
    ],
  },
  x: 200,
};

const manyGroup: ChipFixture = {
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
  eventsGroup?: ChipFixture;
  selectedEventIds?: TimelineEventId[];
  withCallbacks?: boolean;
  hidden?: boolean;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

const setup = ({
  eventsGroup = singleGroup,
  selectedEventIds = [],
  withCallbacks = true,
  hidden,
  onSeeAllEvents,
}: SetupOpts = {}) => {
  const onGroupHover = jest.fn();
  const onOpenTimelines = jest.fn();
  const onSelectTimelineEvents = jest.fn();
  const onDeselectTimelineEvents = jest.fn();

  renderWithProviders(
    <TimelineEventChip
      group={eventsGroup.group}
      x={eventsGroup.x}
      centerY={120}
      selectedEventIds={selectedEventIds}
      hidden={hidden}
      onGroupHover={onGroupHover}
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

  return {
    onGroupHover,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
  };
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

  it("reports the hovered group on mouse enter and null on leave", async () => {
    const { onGroupHover } = setup({ eventsGroup: singleGroup });
    const chip = screen.getByTestId("timeline-event-chip");

    await userEvent.hover(chip);
    expect(onGroupHover).toHaveBeenLastCalledWith(singleGroup.group);

    await userEvent.unhover(chip);
    expect(onGroupHover).toHaveBeenLastCalledWith(null);
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
    expect(
      screen.queryByTestId("timeline-event-popover"),
    ).not.toBeInTheDocument();
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

  it("shows every event in a read-only cluster without opening a sidebar or selecting events", async () => {
    const {
      onOpenTimelines,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    } = setup({ eventsGroup: manyGroup, withCallbacks: false });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));
    await userEvent.hover(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Many 1")).toBeInTheDocument();
    expect(screen.getByText("Many 4")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
    expect(onOpenTimelines).not.toHaveBeenCalled();
    expect(onSelectTimelineEvents).not.toHaveBeenCalled();
    expect(onDeselectTimelineEvents).not.toHaveBeenCalled();
    expect(screen.getByTestId("timeline-event-chip")).toHaveAttribute(
      "data-selected",
      "false",
    );
  });

  it.each([singleGroup, manyGroup])(
    "shows read-only event descriptions without requiring creator metadata ($group.events.length events)",
    async (eventsGroup) => {
      setup({
        withCallbacks: false,
        eventsGroup: {
          ...eventsGroup,
          group: {
            ...eventsGroup.group,
            events: eventsGroup.group.events.map((event) => ({
              ...event,
              creator: undefined,
              description: `${event.name} description`,
            })),
          },
        },
      });

      await userEvent.hover(screen.getByTestId("timeline-event-chip"));

      for (const event of eventsGroup.group.events) {
        expect(
          await screen.findByText(`${event.name} description`),
        ).toBeInTheDocument();
      }
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /edit|delete|new event/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows 'See all' handing the cluster to onSeeAllEvents while a chip click only opens the details", async () => {
    const onSeeAllEvents = jest.fn();
    // No select/open callbacks — the Explorations wiring, where only
    // "See all" acts on the events.
    const { onSelectTimelineEvents } = setup({
      eventsGroup: manyGroup,
      withCallbacks: false,
      onSeeAllEvents,
    });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));
    expect(
      await screen.findByTestId("timeline-event-popover"),
    ).toBeInTheDocument();
    expect(onSelectTimelineEvents).not.toHaveBeenCalled();
    expect(onSeeAllEvents).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("See all"));

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

  it("opens and closes the read-only details from the keyboard", async () => {
    setup({
      withCallbacks: false,
      eventsGroup: {
        ...singleGroup,
        group: {
          ...singleGroup.group,
          events: [
            createMockTimelineEvent({
              id: 1,
              name: "Release v1",
              description: "The first release candidate is ready.",
            }),
          ],
        },
      },
    });

    const chip = screen.getByTestId("timeline-event-chip");
    expect(chip).toHaveAttribute("aria-expanded", "false");

    await userEvent.tab();
    expect(chip).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("Release v1")).toBeInTheDocument();
    expect(
      screen.getByText("The first release candidate is ready."),
    ).toBeInTheDocument();
    expect(chip).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it("returns focus to the chip when the pointer closes keyboard-opened details", async () => {
    setup({ withCallbacks: false });
    const chip = screen.getByTestId("timeline-event-chip");

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(chip).not.toHaveFocus());

    await userEvent.hover(chip);
    await userEvent.unhover(chip);

    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it("closes hover-opened details when focus leaves the chip", async () => {
    setup({ withCallbacks: false });

    await userEvent.tab();
    await userEvent.hover(screen.getByTestId("timeline-event-chip"));
    expect(
      await screen.findByTestId("timeline-event-popover"),
    ).toBeInTheDocument();

    await userEvent.tab({ shift: true });

    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
  });

  it("puts 'See all' within keyboard reach of a keyboard-opened cluster", async () => {
    const onSeeAllEvents = jest.fn();
    setup({ eventsGroup: manyGroup, withCallbacks: false, onSeeAllEvents });

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("See all")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("timeline-event-chip")).not.toHaveFocus();
    });
    await userEvent.tab();
    expect(screen.getByText("See all")).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onSeeAllEvents).toHaveBeenCalledWith(manyGroup.group.events);
  });

  it("does not announce a dialog on a chip whose activation selects events", () => {
    setup();

    expect(screen.getByTestId("timeline-event-chip")).not.toHaveAttribute(
      "aria-haspopup",
    );
  });

  it("marks the chip as hidden when hidden", () => {
    setup({ eventsGroup: singleGroup, hidden: true });
    expect(screen.getByTestId("timeline-event-chip")).toHaveAttribute(
      "data-hidden",
      "true",
    );
  });
});
