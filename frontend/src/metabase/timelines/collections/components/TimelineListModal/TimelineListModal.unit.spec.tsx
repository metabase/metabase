import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import type { TimelineListModalProps } from "./TimelineListModal";
import TimelineListModal from "./TimelineListModal";

function setup(props: TimelineListModalProps) {
  renderWithProviders(<TimelineListModal {...props} />);
}

describe("TimelineListModal", () => {
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

    expect(screen.getByText("Add an event")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineListModalProps>,
): TimelineListModalProps => ({
  timelines: [],
  collection: createMockCollection(),
  ...opts,
});
