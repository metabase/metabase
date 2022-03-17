import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import TimelineCard, { TimelineCardProps } from "./TimelineCard";

describe("TimelineCard", () => {
  it("should expand and collapse the card", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [
          createMockTimelineEvent({ name: "RC1" }),
          createMockTimelineEvent({ name: "RC2" }),
          createMockTimelineEvent({ name: "RC3", archived: true }),
        ],
      }),
    });

    render(<TimelineCard {...props} />);
    expect(screen.queryByText("RC1")).not.toBeInTheDocument();
    expect(screen.queryByText("RC3")).not.toBeInTheDocument();

    userEvent.click(screen.getByText("Releases"));
    expect(screen.getByText("RC1")).toBeInTheDocument();
    expect(screen.queryByText("RC3")).not.toBeInTheDocument();

    userEvent.click(screen.getByText("Releases"));
    expect(screen.queryByText("RC1")).not.toBeInTheDocument();
    expect(screen.queryByText("RC3")).not.toBeInTheDocument();
  });

  it("should toggle visibility of the card", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Releases",
        events: [createMockTimelineEvent({ name: "RC1" })],
      }),
    });

    render(<TimelineCard {...props} />);
    userEvent.click(screen.getByRole("checkbox"));

    expect(props.onToggleTimeline).toHaveBeenCalled();
  });
});

const getProps = (opts?: Partial<TimelineCardProps>): TimelineCardProps => ({
  timeline: createMockTimeline(),
  collection: createMockCollection(),
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  onToggleTimeline: jest.fn(),
  ...opts,
});
