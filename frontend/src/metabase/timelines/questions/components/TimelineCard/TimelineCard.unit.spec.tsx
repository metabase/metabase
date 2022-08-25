import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import TimelineCard, { TimelineCardProps } from "./TimelineCard";

describe("TimelineCard", () => {
  it("should expand and collapse the card", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
    });

    render(<TimelineCard {...props} />);
    expect(screen.queryByText("RC")).not.toBeInTheDocument();

    userEvent.click(screen.getByText("Releases"));
    expect(screen.getByText("RC")).toBeInTheDocument();

    userEvent.click(screen.getByText("Releases"));
    expect(screen.queryByText("RC")).not.toBeInTheDocument();
  });

  it("should toggle visibility of the card", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
    });

    render(<TimelineCard {...props} />);
    userEvent.click(screen.getByRole("checkbox"));

    expect(props.onToggleTimeline).toHaveBeenCalled();
  });

  it("should make a timeline visible when its even is selected", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC" })],
      }),
      isVisible: false,
    });

    render(<TimelineCard {...props} />);
    userEvent.click(screen.getByText("Releases"));
    userEvent.click(screen.getByText("RC"));

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
