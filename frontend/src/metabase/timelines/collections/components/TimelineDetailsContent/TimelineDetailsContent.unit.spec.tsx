import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import type { TimelineDetailsContentProps } from "./TimelineDetailsContent";
import TimelineDetailsContent from "./TimelineDetailsContent";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

function setup(props: TimelineDetailsContentProps) {
  renderWithProviders(<TimelineDetailsContent {...props} />);
}

describe("TimelineDetailsContent", () => {
  it("should search a list of events", async () => {
    const props = getProps({
      timeline: createMockTimeline({
        events: [
          createMockTimelineEvent({ id: 1, name: "RC1" }),
          createMockTimelineEvent({ id: 2, name: "RC2" }),
          createMockTimelineEvent({ id: 3, name: "Release" }),
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
  opts?: Partial<TimelineDetailsContentProps>,
): TimelineDetailsContentProps => ({
  timeline: createMockTimeline(),
  ...opts,
});
