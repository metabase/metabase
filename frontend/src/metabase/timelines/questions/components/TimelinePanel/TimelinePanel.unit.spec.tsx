import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";
import TimelinePanel, { TimelinePanelProps } from "./TimelinePanel";

describe("TimelinePanel", () => {
  it("should allow creating an event and a default timeline", () => {
    const props = getProps({
      timelines: [],
      collection: createMockCollection({ can_write: true }),
    });

    render(<TimelinePanel {...props} />);
    userEvent.click(screen.getByText("Add an event"));

    expect(props.onNewEvent).toHaveBeenCalled();
  });

  it("should allow creating an event within existing timelines", () => {
    const props = getProps({
      timelines: [createMockTimeline()],
      collection: createMockCollection({ can_write: true }),
    });

    render(<TimelinePanel {...props} />);
    userEvent.click(screen.getByText("Add an event"));

    expect(props.onNewEvent).toHaveBeenCalled();
  });

  it("should not allow creating events without write access", () => {
    const props = getProps({
      timelines: [createMockTimeline()],
      collection: createMockCollection({ can_write: false }),
    });

    render(<TimelinePanel {...props} />);

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
