import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { TimelineCard, type TimelineCardProps } from "./TimelineCard";

describe("TimelineCard", () => {
  it("should expand and collapse the card", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
    });

    render(<TimelineCard {...props} />);
    expect(screen.queryByText("RC")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Releases"));
    expect(screen.getByText("RC")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Releases"));
    expect(screen.queryByText("RC")).not.toBeInTheDocument();
  });

  it("should expand when one of its events is selected", () => {
    const event = createMockTimelineEvent({ id: 1, name: "RC" });
    const props = getProps({
      timeline: createMockTimeline({ name: "Releases", events: [event] }),
      selectedEventIds: [1],
    });

    render(<TimelineCard {...props} />);
    expect(screen.getByText("RC")).toBeInTheDocument();
  });

  it("should re-expand after a manual collapse when the same selection is reapplied", async () => {
    const event = createMockTimelineEvent({ id: 1, name: "RC" });
    const props = getProps({
      timeline: createMockTimeline({ name: "Releases", events: [event] }),
      selectedEventIds: [1],
    });

    const { rerender } = render(<TimelineCard {...props} />);
    expect(screen.getByText("RC")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Releases"));
    expect(screen.queryByText("RC")).not.toBeInTheDocument();

    // reapplying the selection (a new array, as the reducer produces) re-expands
    rerender(<TimelineCard {...props} selectedEventIds={[1]} />);
    expect(screen.getByText("RC")).toBeInTheDocument();
  });

  it("should collapse a default-expanded card when another timeline's event is selected", () => {
    const event = createMockTimelineEvent({ id: 1, name: "RC" });
    const props = getProps({
      timeline: createMockTimeline({ name: "Releases", events: [event] }),
      isDefault: true,
      // a selection exists, but it belongs to a different timeline
      selectedEventIds: [999],
    });

    render(<TimelineCard {...props} />);
    expect(screen.queryByText("RC")).not.toBeInTheDocument();
  });

  it("should restore the default expansion when the selection clears", () => {
    const event = createMockTimelineEvent({ id: 1, name: "RC" });
    const props = getProps({
      timeline: createMockTimeline({ name: "Releases", events: [event] }),
      isDefault: true,
      selectedEventIds: [999],
    });

    const { rerender } = render(<TimelineCard {...props} />);
    expect(screen.queryByText("RC")).not.toBeInTheDocument();

    rerender(<TimelineCard {...props} selectedEventIds={[]} />);
    expect(screen.getByText("RC")).toBeInTheDocument();
  });

  it("should toggle visibility of the card", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
    });

    render(<TimelineCard {...props} />);
    await userEvent.click(screen.getByRole("checkbox"));

    expect(props.onShowTimelineEvents).toHaveBeenCalled();
  });
});

const getProps = (opts?: Partial<TimelineCardProps>): TimelineCardProps => ({
  timeline: createMockTimeline(),
  visibleEventIds: [],
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  onShowTimelineEvents: jest.fn(),
  onHideTimelineEvents: jest.fn(),
  ...opts,
});
