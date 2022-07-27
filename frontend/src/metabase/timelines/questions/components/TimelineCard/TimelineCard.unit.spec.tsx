import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import TimelineCard, { TimelineCardProps } from "./TimelineCard";

const user = userEvent.setup();

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

    await user.click(screen.getByText("Releases"));
    expect(screen.getByText("RC")).toBeInTheDocument();

    await user.click(screen.getByText("Releases"));
    expect(screen.queryByText("RC")).not.toBeInTheDocument();
  });

  it("should toggle visibility of the card", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
    });

    render(<TimelineCard {...props} />);
    await user.click(screen.getByRole("checkbox"));

    expect(props.onToggleTimeline).toHaveBeenCalled();
  });

  it("should make a timeline visible when its even is selected", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
      isVisible: false,
    });

    render(<TimelineCard {...props} />);
    await user.click(screen.getByText("Releases"));
    await user.click(screen.getByText("RC"));

    expect(props.onToggleTimeline).toHaveBeenCalledWith(props.timeline, true);
  });
});

const getProps = (opts?: Partial<TimelineCardProps>): TimelineCardProps => ({
  timeline: createMockTimeline(),
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  onToggleTimeline: jest.fn(),
  ...opts,
});
