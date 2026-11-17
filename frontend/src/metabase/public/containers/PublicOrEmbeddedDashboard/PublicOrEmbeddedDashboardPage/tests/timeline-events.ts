import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DashboardCard, TimelineEvent } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

// The spec files that import this mock the static visualizations `setup` registers, so the
// charts here render with the interactive ones, as on a real public or embedded dashboard.
registerVisualizations();

const TIMELINE_ID = 10;
const EXCLUDED_EVENT_ID = 101;
const TIME_SERIES_CARD_ID = 2;
const TIME_SERIES_DASHCARD_ID = 2;

export const RC1 = createMockTimelineEvent({
  id: 100,
  timeline_id: TIMELINE_ID,
  name: "RC1",
  description: "The first release candidate is ready.",
  timestamp: "2027-10-20T00:00:00Z",
});

export const RC2 = createMockTimelineEvent({
  id: 102,
  timeline_id: TIMELINE_ID,
  name: "RC2",
  description: "The second release candidate is ready.",
  timestamp: "2027-10-20T00:00:00Z",
});

/**
 * A time series chart whose saved selection the backend resolved into `timelineEvents`. The
 * backend drops excluded and unrelated events from the payload, so the card's own settings
 * name a timeline and an excluded event the payload no longer carries.
 */
export function createTimeSeriesDashcard(
  timelineEvents: TimelineEvent[],
): DashboardCard {
  return createMockDashboardCard({
    id: TIME_SERIES_DASHCARD_ID,
    card_id: TIME_SERIES_CARD_ID,
    size_x: 12,
    size_y: 6,
    card: createMockCard({
      id: TIME_SERIES_CARD_ID,
      name: "Orders by month",
      display: "line",
      can_write: false,
      visualization_settings: {
        "timeline.selected_timeline_ids": [TIMELINE_ID],
        "timeline.excluded_timeline_event_ids": [EXCLUDED_EVENT_ID],
      },
    }),
    timeline_events: timelineEvents,
  });
}

/**
 * Registered before `setup`, so it answers the chart's query instead of the empty default. The
 * chart places its event chips from the measured plot, which jsdom does not lay out.
 */
export function setupTimeSeriesChart() {
  mockGetBoundingClientRect({ width: 800, height: 400 });
  fetchMock.get(
    new RegExp(
      `/api/(public|embed|preview_embed)/dashboard/[^/]+/dashcard/${TIME_SERIES_DASHCARD_ID}/card/${TIME_SERIES_CARD_ID}(\\?|$)`,
    ),
    createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockDatetimeColumn({
            name: "CREATED_AT",
            display_name: "Created At: Month",
            unit: "month",
          }),
          createMockNumericColumn({ name: "count", display_name: "Count" }),
        ],
        rows: [
          ["2027-08-01T00:00:00Z", 1],
          ["2027-09-01T00:00:00Z", 2],
          ["2027-10-01T00:00:00Z", 3],
          ["2027-11-01T00:00:00Z", 4],
          ["2027-12-01T00:00:00Z", 5],
        ],
      }),
    }),
  );
}

// public routes send `/api/timeline` requests to `/api/public/timeline`, so match any prefix
const TIMELINE_API_PATH = /^\/api\/([a-z_]+\/)?timeline/;

export const getTimelineRequests = () =>
  fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter((url) => TIMELINE_API_PATH.test(new URL(url).pathname));

export const getTimeSeriesDashCard = () =>
  checkNotNull(
    screen
      .getAllByTestId("dashcard")
      .find(
        (dashcard) =>
          within(dashcard).queryAllByText("Orders by month").length > 0,
      ),
  );

export const findEventChip = (name: string) =>
  screen.findByRole("button", { name });

export async function expectReadOnlyDashboardEvents() {
  const chip = await findEventChip(RC1.name);
  const dashcard = getTimeSeriesDashCard();
  expect(within(dashcard).getByText("Created At: Month")).toBeInTheDocument();
  expect(screen.getAllByTestId("timeline-event-chip")).toHaveLength(1);
  expect(chip).toHaveAttribute("data-selected", "false");

  await userEvent.click(chip);
  expect(screen.getByRole("button", { name: RC1.name })).toHaveAttribute(
    "data-selected",
    "false",
  );
  expect(
    screen.queryByTestId("dashboard-events-sidebar"),
  ).not.toBeInTheDocument();

  await userEvent.hover(screen.getByRole("button", { name: RC1.name }));
  const popover = await screen.findByTestId("timeline-event-popover");
  expect(within(popover).getByText(RC1.name)).toBeInTheDocument();
  expect(
    within(popover).getByText("The first release candidate is ready."),
  ).toBeInTheDocument();
  expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
  expect(
    within(popover).queryByRole("button", { name: /edit|create|delete/i }),
  ).not.toBeInTheDocument();
  await userEvent.unhover(screen.getByRole("button", { name: RC1.name }));

  await userEvent.click(
    within(dashcard).getByRole("button", {
      name: "More options",
    }),
  );
  const menu = await screen.findByRole("menu");
  expect(
    within(menu).getByRole("menuitem", { name: /Download results$/ }),
  ).toBeInTheDocument();
  expect(
    within(menu).queryByRole("menuitem", { name: /(^|\s)Events$/ }),
  ).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );

  expect(getTimelineRequests()).toEqual([]);
}
