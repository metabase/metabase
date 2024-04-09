import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { TimelineCardProps } from "./TimelineCard";
import TimelineCard from "./TimelineCard";

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
