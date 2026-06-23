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
  isSelected: false,
  iconName: "cloud",
  count: 1,
};

const clusterGroup: PositionedTimelineEventGroup = {
  group: {
    date: "2025-02-01T00:00:00Z",
    events: [
      createMockTimelineEvent({ id: 2, name: "Event A" }),
      createMockTimelineEvent({ id: 3, name: "Event B" }),
    ],
  },
  x: 200,
  isSelected: false,
  iconName: "star",
  count: 2,
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
  const onSelectTimelineEvents = jest.fn();
  const onDeselectTimelineEvents = jest.fn();

  renderWithProviders(
    <TimelineEventChip
      positioned={positioned}
      centerY={120}
      chipSize={24}
      onOpenTimelines={withOpenTimelines ? onOpenTimelines : undefined}
      onSelectTimelineEvents={onSelectTimelineEvents}
      onDeselectTimelineEvents={onDeselectTimelineEvents}
    />,
  );

  return { onOpenTimelines, onSelectTimelineEvents, onDeselectTimelineEvents };
};

describe("TimelineEventChip", () => {
  it("renders the event count for a cluster", () => {
    setup({ positioned: clusterGroup });
    expect(screen.getByTestId("timeline-event-chip")).toHaveTextContent("2");
  });

  it("opens a popover listing the events and selects them on click", async () => {
    const { onSelectTimelineEvents } = setup({ positioned: clusterGroup });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(onSelectTimelineEvents).toHaveBeenCalledWith(
      clusterGroup.group.events,
    );
    expect(await screen.findByText("Event A")).toBeInTheDocument();
    expect(screen.getByText("Event B")).toBeInTheDocument();
  });

  it("deselects events when the popover is toggled closed", async () => {
    const { onDeselectTimelineEvents } = setup({ positioned: clusterGroup });

    const chip = screen.getByTestId("timeline-event-chip");
    await userEvent.click(chip);
    await userEvent.click(chip);

    expect(onDeselectTimelineEvents).toHaveBeenCalled();
  });

  it("calls onOpenTimelines from the 'See all' action", async () => {
    const { onOpenTimelines } = setup({ positioned: clusterGroup });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));
    await userEvent.click(await screen.findByText("See all"));

    expect(onOpenTimelines).toHaveBeenCalled();
  });

  it("hides 'See all' when onOpenTimelines is not provided", async () => {
    setup({ positioned: clusterGroup, withOpenTimelines: false });

    await userEvent.click(screen.getByTestId("timeline-event-chip"));

    expect(await screen.findByText("Event A")).toBeInTheDocument();
    expect(screen.queryByText("See all")).not.toBeInTheDocument();
  });
});
