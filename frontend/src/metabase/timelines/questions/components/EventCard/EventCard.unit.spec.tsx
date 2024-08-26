import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { EventCardProps } from "./EventCard";
import EventCard from "./EventCard";

describe("EventCard", () => {
  it("should render an event with date", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-01-01T10:20:00Z",
        time_matters: false,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("January 1, 2020")).toBeInTheDocument();
  });

  it("should render an event with date and time", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-01-01T10:20:00Z",
        time_matters: true,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("January 1, 2020, 10:20 AM")).toBeInTheDocument();
  });

  it("should toggle an event's visibility", async () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-01-01T10:20:00Z",
        time_matters: true,
      }),
    });

    render(<EventCard {...props} />);

    const checkbox = screen.getByRole("checkbox");

    expect(checkbox).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(props.onHideTimelineEvents).toHaveBeenCalled();
  });
});

const getProps = (opts?: Partial<EventCardProps>): EventCardProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  isVisible: true,
  onShowTimelineEvents: jest.fn(),
  onHideTimelineEvents: jest.fn(),
  ...opts,
});
