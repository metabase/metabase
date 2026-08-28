import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DashboardCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";

registerVisualizations();

const DASHBOARD_ID = 1;
const COLLECTION = createMockCollection({ id: 7 });

const LINE_DASHCARD_ID = 1;
const TABLE_DASHCARD_ID = 2;
const VISUALIZER_DASHCARD_ID = 3;

const RC1 = createMockTimelineEvent({
  id: 101,
  timeline_id: 10,
  name: "RC1",
  timestamp: "2025-06-01T00:00:00",
});

const TIMELINE = createMockTimeline({
  id: 10,
  name: "Releases",
  collection_id: COLLECTION.id,
  collection: COLLECTION,
  events: [RC1],
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

const GRAPH_SETTINGS = {
  "graph.dimensions": ["CREATED_AT"],
  "graph.metrics": ["count"],
};

const LINE_DASHCARD = createMockDashboardCard({
  id: LINE_DASHCARD_ID,
  dashboard_id: DASHBOARD_ID,
  card_id: LINE_DASHCARD_ID,
  card: createMockCard({
    id: LINE_DASHCARD_ID,
    name: "Orders over time",
    display: "line",
    visualization_settings: GRAPH_SETTINGS,
  }),
});

const TABLE_DASHCARD = createMockDashboardCard({
  id: TABLE_DASHCARD_ID,
  dashboard_id: DASHBOARD_ID,
  card_id: TABLE_DASHCARD_ID,
  col: 6,
  card: createMockCard({
    id: TABLE_DASHCARD_ID,
    name: "Orders table",
    display: "table",
  }),
});

const VISUALIZER_DASHCARD = createMockVisualizerDashboardCard({
  id: VISUALIZER_DASHCARD_ID,
  dashboard_id: DASHBOARD_ID,
  card_id: VISUALIZER_DASHCARD_ID,
  col: 12,
  card: createMockCard({
    id: VISUALIZER_DASHCARD_ID,
    name: "Combined chart",
    display: "line",
    visualization_settings: GRAPH_SETTINGS,
  }),
  visualization_settings: {
    visualization: {
      display: "line",
      columnValuesMapping: {},
      settings: GRAPH_SETTINGS,
    },
  },
});

const ALL_DASHCARDS = [LINE_DASHCARD, TABLE_DASHCARD, VISUALIZER_DASHCARD];

async function setup({
  dashcards = ALL_DASHCARDS,
}: { dashcards?: DashboardCard[] } = {}) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    collection_id: COLLECTION.id,
    dashcards,
  });
  const database = createMockDatabase();

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([database]);
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupCollectionsEndpoints({ collections: [COLLECTION] });
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });
  setupSearchEndpoints([]);
  setupCardsEndpoints([]);
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);
  setupTimelinesEndpoints([TIMELINE]);
  dashcards.forEach((dashcard) =>
    setupDashcardQueryEndpoints(DASHBOARD_ID, dashcard, TIME_SERIES_DATASET),
  );

  renderWithProviders(
    <Route path="/dashboard/:slug" element={<DashboardApp />} />,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [database] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );

  await waitForLoaderToBeRemoved();
}

const openDashCardMenu = async (cardName: string) => {
  const dashcards = await screen.findAllByTestId("dashcard");
  const dashcard = checkNotNull(
    dashcards.find((card) => within(card).queryByText(cardName) != null),
  );
  await userEvent.click(within(dashcard).getByLabelText("ellipsis icon"));
};

const openDashboardMenu = async () => {
  await userEvent.click(await screen.findByLabelText("Move, trash, and more…"));
};

describe("DashboardApp > timeline events", () => {
  it("offers events on a time series card", async () => {
    await setup();

    await openDashCardMenu("Orders over time");
    await userEvent.click(await screen.findByText("Events"));

    expect(
      await screen.findByTestId("dashboard-events-sidebar"),
    ).toBeInTheDocument();
    expect(await screen.findByText("RC1")).toBeInTheDocument();
  });

  it("does not offer events on a card that is not a time series", async () => {
    await setup({ dashcards: [TABLE_DASHCARD] });

    await openDashCardMenu("Orders table");

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });

  it("does not offer events on a visualizer card", async () => {
    await setup({ dashcards: [VISUALIZER_DASHCARD] });

    await openDashCardMenu("Combined chart");

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Events")).not.toBeInTheDocument();
  });

  it("offers events for the whole dashboard from the header menu", async () => {
    await setup();

    await openDashboardMenu();
    await userEvent.click(await screen.findByText("Events"));

    expect(
      await screen.findByTestId("dashboard-events-sidebar"),
    ).toBeInTheDocument();
    expect(await screen.findByText("RC1")).toBeInTheDocument();
  });

  it("tells the user a dashboard without time series cards has nowhere to show events", async () => {
    await setup({ dashcards: [TABLE_DASHCARD] });

    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);

    await openDashboardMenu();
    await userEvent.click(await screen.findByText("Events"));

    expect(
      await screen.findByText("Events can be displayed on time series charts"),
    ).toBeInTheDocument();
  });
});
