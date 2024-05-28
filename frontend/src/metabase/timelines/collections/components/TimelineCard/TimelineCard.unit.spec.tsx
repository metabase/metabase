import { render, screen } from "@testing-library/react";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { TimelineCardProps } from "./TimelineCard";
import TimelineCard from "./TimelineCard";

describe("TimelineCard", () => {
  it("should render timeline", () => {
    const props = getProps({
      timeline: createMockTimeline({
        events: [
          createMockTimelineEvent(),
          createMockTimelineEvent(),
          createMockTimelineEvent({ archived: true }),
        ],
      }),
    });

    render(<TimelineCard {...props} />);

    expect(screen.getByText("2 events")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<TimelineCardProps>): TimelineCardProps => ({
  timeline: createMockTimeline(),
  ...opts,
});
