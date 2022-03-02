import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import EventCard, { EventCardProps } from "./EventCard";

describe("EventCard", () => {
  it("should not render a menu for read-only users", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: false,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
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
