import { render, screen } from "@testing-library/react";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { EventListProps } from "./EventList";
import EventList from "./EventList";

describe("EventList", () => {
  it("should render a list of events", () => {
    const props = getProps({
      events: [
        createMockTimelineEvent({ id: 1, name: "RC1" }),
        createMockTimelineEvent({ id: 2, name: "RC2" }),
      ],
    });

    render(<EventList {...props} />);

    expect(screen.getByText("RC1")).toBeInTheDocument();
    expect(screen.getByText("RC2")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<EventListProps>): EventListProps => ({
  events: [],
  timeline: createMockTimeline(),
  ...opts,
});
