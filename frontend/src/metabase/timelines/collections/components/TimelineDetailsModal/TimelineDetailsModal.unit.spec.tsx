import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import TimelineDetailsModal, {
  TimelineDetailsModalProps,
} from "./TimelineDetailsModal";

describe("TimelineDetailsModal", () => {
  it("should use the collection's name for default timelines", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Metrics events",
        default: true,
        collection: createMockCollection({
          name: "Analytics",
        }),
      }),
    });

    render(<TimelineDetailsModal {...props} />);

    expect(screen.getByText("Analytics events")).toBeInTheDocument();
  });

  it("should use the timeline's name for non-default timelines", () => {
    const props = getProps({
      timeline: createMockTimeline({
        name: "Metrics events",
        default: false,
        collection: createMockCollection({
          name: "Analytics",
        }),
      }),
    });

    render(<TimelineDetailsModal {...props} />);

    expect(screen.getByText("Metrics events")).toBeInTheDocument();
  });

  it("should search a list of events", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        events: [
          createMockTimelineEvent({ name: "RC1" }),
          createMockTimelineEvent({ name: "RC2" }),
          createMockTimelineEvent({ name: "Release" }),
        ],
      }),
    });

    render(<TimelineDetailsModal {...props} />);

    userEvent.type(screen.getByPlaceholderText("Search for an event"), "RC");
    await waitFor(() => {
      expect(screen.queryByText("Release")).not.toBeInTheDocument();
    });
    expect(screen.getByText("RC1")).toBeInTheDocument();
    expect(screen.getByText("RC2")).toBeInTheDocument();

    userEvent.type(screen.getByPlaceholderText("Search for an event"), "1");
    await waitFor(() => {
      expect(screen.queryByText("RC2")).not.toBeInTheDocument();
    });
    expect(screen.getByText("RC1")).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<TimelineDetailsModalProps>,
): TimelineDetailsModalProps => ({
  timeline: createMockTimeline(),
  ...opts,
});
