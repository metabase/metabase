import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import type { TimelineEmptyStateProps } from "./TimelineEmptyState";
import TimelineEmptyState from "./TimelineEmptyState";

function setup(props: TimelineEmptyStateProps) {
  renderWithProviders(<TimelineEmptyState {...props} />);
}

describe("TimelineEmptyState", () => {
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

    setup(props);

    expect(screen.queryByText("Create event")).not.toBeInTheDocument();
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

    setup(props);

    expect(screen.getByText("Create event")).toBeInTheDocument();
  });

  it("should allow to add events when the collection is not read-only", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    setup(props);

    expect(screen.getByText("Create event")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineEmptyStateProps>,
): TimelineEmptyStateProps => ({
  collection: createMockCollection(),
  ...opts,
});
