import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import TimelineEmptyState, {
  TimelineEmptyStateProps,
} from "./TimelineEmptyState";

describe("TimelineEmptyState", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2015, 0, 1));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render the empty state with the current date", () => {
    const props = getProps();

    render(<TimelineEmptyState {...props} />);

    expect(screen.getByText("January 1, 2015"));
  });
});

const getProps = (
  opts?: Partial<TimelineEmptyStateProps>,
): TimelineEmptyStateProps => ({
  timeline: createMockTimeline(),
  collection: createMockCollection(),
  ...opts,
});
