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

  it("should render an empty state with the current date", () => {
    const props = getProps();

    render(<TimelineEmptyState {...props} />);

    expect(screen.getByText("January 1, 2015")).toBeInTheDocument();
  });

  it("should not allow to add events when the timeline is read-only", () => {
    const props = getProps({
      timeline: createMockTimeline({
        collection: createMockCollection({
          can_write: false,
        }),
      }),
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<TimelineEmptyState {...props} />);

    expect(screen.queryByText("Add an event")).not.toBeInTheDocument();
  });

  it("should allow to add events when the timeline is not read-only", () => {
    const props = getProps({
      timeline: createMockTimeline({
        collection: createMockCollection({
          can_write: true,
        }),
      }),
      collection: createMockCollection({
        can_write: false,
      }),
    });

    render(<TimelineEmptyState {...props} />);

    expect(screen.getByText("Add an event")).toBeInTheDocument();
  });

  it("should allow to add events when the collection is not read-only", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    render(<TimelineEmptyState {...props} />);

    expect(screen.getByText("Add an event")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineEmptyStateProps>,
): TimelineEmptyStateProps => ({
  collection: createMockCollection(),
  ...opts,
});
