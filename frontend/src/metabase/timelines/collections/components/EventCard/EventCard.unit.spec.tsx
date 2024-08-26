import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUser,
} from "metabase-types/api/mocks";

import type { EventCardProps } from "./EventCard";
import EventCard from "./EventCard";

describe("EventCard", () => {
  it("should format a day-only event", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-12-20T00:00:00Z",
        time_matters: false,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("December 20, 2020")).toBeInTheDocument();
  });

  it("should format a time-sensitive event", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        timestamp: "2020-12-20T10:00:00Z",
        time_matters: true,
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.getByText("December 20, 2020, 10:00 AM")).toBeInTheDocument();
  });

  it("should format an event with the user who created the event", () => {
    const props = getProps({
      event: createMockTimelineEvent({
        creator: createMockUser({
          common_name: "Testy Test",
        }),
        created_at: "2020-12-20T10:00:00Z",
      }),
    });

    render(<EventCard {...props} />);

    expect(
      screen.getByText("Testy Test added this on December 20, 2020"),
    ).toBeInTheDocument();
  });

  it("should not render the menu for read-only users", () => {
    const props = getProps({
      timeline: createMockTimeline({
        collection: createMockCollection({
          can_write: false,
        }),
      }),
    });

    render(<EventCard {...props} />);

    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("should render the menu for users with write permissions", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        collection: createMockCollection({
          can_write: true,
        }),
      }),
    });

    render(<EventCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");

    expect(screen.getByText("Edit event")).toBeInTheDocument();
    expect(screen.getByText("Archive event")).toBeInTheDocument();
  });

  it("should render the menu for an archived event", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        collection: createMockCollection({
          can_write: true,
        }),
      }),
      event: createMockTimelineEvent({
        archived: true,
      }),
    });

    render(<EventCard {...props} />);
    await userEvent.click(screen.getByLabelText("ellipsis icon"));
    await screen.findByRole("dialog");

    expect(screen.getByText("Unarchive event")).toBeInTheDocument();
    expect(screen.getByText("Delete event")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<EventCardProps>): EventCardProps => ({
  event: createMockTimelineEvent(),
  timeline: createMockTimeline(),
  onArchive: jest.fn(),
  onUnarchive: jest.fn(),
  ...opts,
});
