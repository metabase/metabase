import { renderWithProviders, screen } from "__support__/ui";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventInfo } from "./TimelineEventInfo";

describe("TimelineEventInfo", () => {
  it("renders the date without time when time does not matter", () => {
    const event = createMockTimelineEvent({
      timestamp: "2020-01-01T10:20:00Z",
      time_matters: false,
    });

    renderWithProviders(<TimelineEventInfo event={event} />);

    expect(screen.getByText("January 1, 2020")).toBeInTheDocument();
  });

  it("renders the date with time when time matters", () => {
    const event = createMockTimelineEvent({
      timestamp: "2020-01-01T10:20:00Z",
      time_matters: true,
    });

    renderWithProviders(<TimelineEventInfo event={event} />);

    expect(screen.getByText("January 1, 2020, 10:20 AM")).toBeInTheDocument();
  });

  it("renders the name, description and creator info", () => {
    const event = createMockTimelineEvent({
      name: "v3.0 launch",
      description: "The big release",
    });

    renderWithProviders(<TimelineEventInfo event={event} />);

    expect(screen.getByText("v3.0 launch")).toBeInTheDocument();
    expect(screen.getByText("The big release")).toBeInTheDocument();
    expect(screen.getByText(/added this on/)).toBeInTheDocument();
  });

  it("omits the description when the event has none", () => {
    const event = createMockTimelineEvent({
      name: "Beta cut",
      description: null,
    });

    renderWithProviders(<TimelineEventInfo event={event} />);

    expect(screen.getByText("Beta cut")).toBeInTheDocument();
    expect(screen.queryByText("The big release")).not.toBeInTheDocument();
  });
});
