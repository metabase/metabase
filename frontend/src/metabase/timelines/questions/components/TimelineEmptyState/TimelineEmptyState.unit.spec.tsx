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
  it("should allow event creation for users with write access to the collection", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: true,
      }),
    });

    setup(props);

    const button = screen.getByRole("button", { name: "Add an event" });
    expect(button).toBeInTheDocument();
  });

  it("should allow event creation for users with write access to a timeline", () => {
    const props = getProps({
      timelines: [
        createMockTimeline({
          collection: createMockCollection({ can_write: true }),
        }),
      ],
      collection: createMockCollection({
        can_write: false,
      }),
    });

    setup(props);

    const button = screen.getByRole("button", { name: "Add an event" });
    expect(button).toBeInTheDocument();
  });

  it("should not allow event creation for users without write access", () => {
    const props = getProps({
      collection: createMockCollection({
        can_write: false,
      }),
    });

    setup(props);

    const button = screen.queryByRole("button", { name: "Add an event" });
    expect(button).not.toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineEmptyStateProps>,
): TimelineEmptyStateProps => ({
  timelines: [],
  collection: createMockCollection(),
  onNewEvent: jest.fn(),
  ...opts,
});
