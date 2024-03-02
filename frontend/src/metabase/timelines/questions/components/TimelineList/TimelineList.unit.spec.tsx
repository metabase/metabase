import { render, screen } from "@testing-library/react";

import { createMockTimeline } from "metabase-types/api/mocks";

import type { TimelineListProps } from "./TimelineList";
import TimelineList from "./TimelineList";

describe("TimelineList", () => {
  it("should render a list of timelines", () => {
    const props = getProps({
      timelines: [
        createMockTimeline({ name: "Releases" }),
        createMockTimeline({ name: "Holidays" }),
      ],
    });

    render(<TimelineList {...props} />);

    expect(screen.getByText("Releases")).toBeInTheDocument();
    expect(screen.getByText("Holidays")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<TimelineListProps>): TimelineListProps => ({
  timelines: [],
  visibleEventIds: [],
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  onShowTimelineEvents: jest.fn(),
  onHideTimelineEvents: jest.fn(),

  ...opts,
});
