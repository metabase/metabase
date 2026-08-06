import { renderWithProviders, screen } from "__support__/ui";
import { createMockTimelineEvent } from "metabase-types/api/mocks";

import { TimelineEventCard } from "./TimelineEventCard";

describe("TimelineEventCard", () => {
  it("renders the event name, description and creator info", () => {
    const event = createMockTimelineEvent({
      name: "v3.0 launch",
      description: "The big release",
    });

    renderWithProviders(<TimelineEventCard event={event} />);

    expect(screen.getByText("v3.0 launch")).toBeInTheDocument();
    expect(screen.getByText("The big release")).toBeInTheDocument();
    expect(screen.getByText(/added this on/)).toBeInTheDocument();
  });

  it("omits the description when the event has none", () => {
    const event = createMockTimelineEvent({
      name: "Beta cut",
      description: null,
    });

    renderWithProviders(<TimelineEventCard event={event} />);

    expect(screen.getByText("Beta cut")).toBeInTheDocument();
    expect(screen.queryByText("The big release")).not.toBeInTheDocument();
  });

  it("is read-only: no checkbox, selection toggle or actions menu", () => {
    const event = createMockTimelineEvent({ name: "RC1" });

    renderWithProviders(<TimelineEventCard event={event} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
