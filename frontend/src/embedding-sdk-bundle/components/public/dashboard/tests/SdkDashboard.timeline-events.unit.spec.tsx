import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockStructuredDatasetQuery,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { SdkDashboard } from "../SdkDashboard";

import { dashboardTabs, setupSdkDashboard } from "./setup";

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

const LINE_DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: 1,
  dashboard_tab_id: dashboardTabs[0].id,
  card: createMockCard({
    id: 1,
    name: "Orders over time",
    display: "line",
    dataset_query: createMockStructuredDatasetQuery({
      query: { "source-table": ORDERS_ID },
    }),
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
      "timeline.selected_timeline_ids": [TIMELINE.id],
      "timeline.excluded_timeline_event_ids": [],
    },
  }),
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

const setup = async () => {
  setupTimelinesEndpoints([TIMELINE]);
  return setupSdkDashboard({
    component: SdkDashboard,
    dashcards: [LINE_DASHCARD],
    dataset: TIME_SERIES_DATASET,
  });
};

describe("SdkDashboard > timeline events", () => {
  it("neither shows nor requests the events a card was saved with", async () => {
    await setup();

    const dashcard = await screen.findByTestId("dashcard");
    expect(within(dashcard).queryByLabelText("RC1")).not.toBeInTheDocument();
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
  });
});
