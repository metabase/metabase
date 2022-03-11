import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import TimelineCard, { TimelineCardProps } from "./TimelineCard";

describe("TimelineCard", () => {
  it("should render timeline", () => {
    const props = getProps({
      timeline: createMockTimeline({
        events: [createMockTimelineEvent(), createMockTimelineEvent()],
      }),
    });

    render(<TimelineCard {...props} />);

    expect(screen.getByText("2 events")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<TimelineCardProps>): TimelineCardProps => ({
  timeline: createMockTimeline(),
  collection: createMockCollection(),
  ...opts,
});
