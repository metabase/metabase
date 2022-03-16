import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import TimelineList, { TimelineListProps } from "./TimelineList";

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
  collection: createMockCollection(),
  visibility: {},
  isVisibleByDefault: false,
  onToggleTimeline: jest.fn(),
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  ...opts,
});
