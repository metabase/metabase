import { render, screen } from "@testing-library/react";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import TimelineListModal, { TimelineListModalProps } from "./TimelineListModal";

describe("TimelineListModal", () => {
  it("should render a list of timelines", () => {
    const props = getProps({
      timelines: [createMockTimeline({ name: "Releases" })],
      collection: createMockCollection({ can_write: true }),
    });

    render(<TimelineListModal {...props} />);

    expect(screen.getByText("Releases")).toBeInTheDocument();
  });

  it("should render an empty state when there are no timelines", () => {
    const props = getProps({
      timelines: [],
      collection: createMockCollection({ can_write: true }),
    });

    render(<TimelineListModal {...props} />);

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
