import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { TimelineDetailsModalProps } from "./TimelineDetailsModal";
import TimelineDetailsModal from "./TimelineDetailsModal";

function setup(props: TimelineDetailsModalProps) {
  renderWithProviders(<TimelineDetailsModal {...props} />);
}

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

    setup(props);

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

    setup(props);

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

    setup(props);

    await userEvent.type(
      screen.getByPlaceholderText("Search for an event"),
      "RC",
    );
    await waitFor(() => {
      expect(screen.queryByText("Release")).not.toBeInTheDocument();
    });
    expect(screen.getByText("RC1")).toBeInTheDocument();
    expect(screen.getByText("RC2")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search for an event"),
      "1",
    );
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
