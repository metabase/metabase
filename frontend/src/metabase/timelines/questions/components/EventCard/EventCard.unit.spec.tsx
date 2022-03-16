import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import EventCard, { EventCardProps } from "./EventCard";

describe("EventCard", () => {
  it("should render an event with date", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-01-01T10:20:00Z",
        time_matters: false,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("January 1, 2020"));
  });

  it("should render an event with date and time", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-01-01T10:20:00Z",
        time_matters: true,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("January 1, 2020, 10:20 AM"));
  });
});

const getProps = (opts?: Partial<EventCardProps>): EventCardProps => ({
  event: createMockTimelineEvent(),
  collection: createMockCollection(),
  ...opts,
});
