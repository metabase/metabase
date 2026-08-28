import fetchMock from "fetch-mock";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupEmbedDashboardEndpoints } from "__support__/server-mocks/embed";
import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedDashboardPage } from "../PublicOrEmbeddedDashboardPage";

registerVisualizations();

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";

const TIMELINE = createMockTimeline({
  id: 10,
  events: [
    createMockTimelineEvent({
      id: 101,
      timeline_id: 10,
      name: "RC1",
      timestamp: "2025-06-01T00:00:00",
    }),
  ],
});

const TIME_SERIES_DATASET = createMockDataset({
  data: {
    cols: [
      createMockDatetimeColumn({ name: "CREATED_AT", unit: "day" }),
      createMockNumericColumn({ name: "count" }),
    ],
    rows: [
      ["2025-06-01", 1],
      ["2025-06-05", 2],
    ],
  },
});

const DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: 1,
  card: createMockCard({
    id: 1,
    name: "Orders over time",
    display: "line",
    can_write: false,
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    },
  }),
});

async function setup() {
  mockSettings({});
  setupDatabasesEndpoints([createMockDatabase()]);
  setupTimelinesEndpoints([TIMELINE]);

  const dashboard = createMockDashboard({
    id: 1,
    name: "Embedded dashboard",
    parameters: [],
    dashcards: [DASHCARD],
  });
  setupEmbedDashboardEndpoints(
    MOCK_TOKEN,
    dashboard,
    [DASHCARD],
    TIME_SERIES_DATASET,
  );

  window.history.replaceState({}, "", `/embed/dashboard/${MOCK_TOKEN}`);

  renderWithProviders(
    <Route
      path="embed/dashboard/:token"
      element={<PublicOrEmbeddedDashboardPage />}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `/embed/dashboard/${MOCK_TOKEN}`,
    },
  );

  await screen.findAllByTestId("dashcard");
}

describe("PublicOrEmbeddedDashboardPage > timeline events", () => {
  it("neither shows nor requests events on an embedded dashboard", async () => {
    await setup();

    expect(screen.queryByText("Events")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-events-sidebar"),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
  });
});
