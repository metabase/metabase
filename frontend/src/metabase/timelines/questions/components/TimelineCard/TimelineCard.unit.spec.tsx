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
