import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import type { TimelinePanelProps } from "./TimelinePanel";
import TimelinePanel from "./TimelinePanel";

function setup(props: TimelinePanelProps) {
  renderWithProviders(<TimelinePanel {...props} />);
}

describe("TimelinePanel", () => {
  it("should allow creating an event and a default timeline", async () => {
    const props = getProps({
      timelines: [],
      collection: createMockCollection({ can_write: true }),
    });

    setup(props);
    await userEvent.click(screen.getByText("Add an event"));

    expect(props.onNewEvent).toHaveBeenCalled();
  });

  it("should allow creating an event within existing timelines", async () => {
    const props = getProps({
      timelines: [createMockTimeline()],
      collection: createMockCollection({ can_write: true }),
    });

    setup(props);
    await userEvent.click(screen.getByText("Add an event"));

    expect(props.onNewEvent).toHaveBeenCalled();
  });

  it("should not allow creating events without write access", () => {
    const props = getProps({
      timelines: [createMockTimeline()],
      collection: createMockCollection({ can_write: false }),
    });

    setup(props);

    expect(screen.queryByText("Add an event")).not.toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<TimelinePanelProps>): TimelinePanelProps => ({
  timelines: [],
  visibleEventIds: [],
  collection: createMockCollection(),
  onNewEvent: jest.fn(),
  onEditEvent: jest.fn(),
  onArchiveEvent: jest.fn(),
  onShowTimelineEvents: jest.fn(),
  onHideTimelineEvents: jest.fn(),

  ...opts,
});
