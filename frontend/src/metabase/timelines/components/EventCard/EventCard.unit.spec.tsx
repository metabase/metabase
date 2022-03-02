import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import EventCard, { EventCardProps } from "./EventCard";
import userEvent from "@testing-library/user-event";

describe("EventCard", () => {
  it("should not render the menu for read-only users", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: false,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should render the menu for users with write permissions", async () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<EventCard {...props} />);
    userEvent.click(screen.getByLabelText("ellipsis icon"));

    expect(screen.getByText("Edit event")).toBeInTheDocument();
    expect(screen.getByText("Archive event")).toBeInTheDocument();
  });
});

export const getProps = (opts?: Partial<EventCardProps>): EventCardProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  collection: createMockCollection(),
  onArchive: jest.fn(),
  onUnarchive: jest.fn(),
  ...opts,
});
