import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { Timeline, TimelineId } from "metabase-types/api";
import { createMockTimeline } from "metabase-types/api/mocks";

import { TimelineDropdown } from "./TimelineDropdown";

function makeTimeline(id: TimelineId, name: string): Timeline {
  return createMockTimeline({ id, name });
}

interface SetupOpts {
  timelines: Timeline[];
  selectedTimelineId?: TimelineId | null;
  interestingTimelineIds?: ReadonlySet<TimelineId>;
}

function setup({
  timelines,
  selectedTimelineId = null,
  interestingTimelineIds,
}: SetupOpts) {
  const onSelectTimelineId = jest.fn();
  renderWithProviders(
    <TimelineDropdown
      availableTimelines={timelines}
      selectedTimelineId={selectedTimelineId}
      onSelectTimelineId={onSelectTimelineId}
      interestingTimelineIds={interestingTimelineIds}
    />,
  );
  return { onSelectTimelineId };
}

async function openDropdown() {
  await userEvent.click(
    screen.getByRole("textbox", { name: "Select timeline" }),
  );
}

describe("TimelineDropdown", () => {
  const releases = makeTimeline(1, "Releases");
  const incidents = makeTimeline(2, "Incidents");
  const marketing = makeTimeline(3, "Marketing");

  it("renders no markers when no interestingTimelineIds prop is passed", async () => {
    setup({ timelines: [releases, incidents] });
    await openDropdown();

    // Both options are visible…
    expect(
      await screen.findByRole("option", { name: /Releases/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Incidents/ }),
    ).toBeInTheDocument();
    // …and no marker is rendered for any of them.
    expect(
      screen.queryAllByTestId("potentially-interesting-marker"),
    ).toHaveLength(0);
  });

  it("renders the marker only on items in interestingTimelineIds", async () => {
    setup({
      timelines: [releases, incidents, marketing],
      interestingTimelineIds: new Set([releases.id, marketing.id]),
    });
    await openDropdown();

    const releasesOption = await screen.findByRole("option", {
      name: /Releases/,
    });
    const incidentsOption = screen.getByRole("option", { name: /Incidents/ });
    const marketingOption = screen.getByRole("option", { name: /Marketing/ });

    expect(
      within(releasesOption).getByTestId("potentially-interesting-marker"),
    ).toBeInTheDocument();
    expect(
      within(marketingOption).getByTestId("potentially-interesting-marker"),
    ).toBeInTheDocument();
    expect(
      within(incidentsOption).queryByTestId("potentially-interesting-marker"),
    ).not.toBeInTheDocument();
  });

  it("does not render the marker on the closed-state trigger even when an interesting timeline is selected", () => {
    setup({
      timelines: [releases],
      selectedTimelineId: releases.id,
      interestingTimelineIds: new Set([releases.id]),
    });

    // Trigger shows the plain label; no marker in the closed dropdown.
    const trigger = screen.getByRole("textbox", { name: "Select timeline" });
    expect(trigger).toHaveValue("Releases");
    expect(
      screen.queryAllByTestId("potentially-interesting-marker"),
    ).toHaveLength(0);
  });
});
