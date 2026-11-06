import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import type { TimelineListContentProps } from "./TimelineListContent";
import TimelineListContent from "./TimelineListContent";

function setup(props: TimelineListContentProps) {
  renderWithProviders(<TimelineListContent {...props} />);
}

describe("TimelineListContent", () => {
  it("should render a list of timelines", () => {
    const props = getProps({
      timelines: [createMockTimeline({ name: "Releases" })],
      collection: createMockCollection({ can_write: true }),
    });

    setup(props);

    expect(screen.getByText("Releases")).toBeInTheDocument();
  });

  it("should render an empty state when there are no timelines", () => {
    const props = getProps({
      timelines: [],
      collection: createMockCollection({ can_write: true }),
    });

    setup(props);

    expect(screen.getByText("Create event")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineListContentProps>,
): TimelineListContentProps => ({
  timelines: [],
  collection: createMockCollection(),
  ...opts,
});
