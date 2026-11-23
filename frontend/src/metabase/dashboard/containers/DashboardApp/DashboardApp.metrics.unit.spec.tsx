import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  Dataset,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockSearchResult,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();
registerDashboardVisualizations();

const DATABASE = createSampleDatabase();
const DASHBOARD_ID = 1;

const PERSONAL_COLLECTION = createMockCollection({
  id: 50,
  name: "My personal collection",
  personal_owner_id: 1,
  is_personal: true,
});

const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: PERSONAL_COLLECTION.id,
});

const ORDERS_QUESTION = createMockCard({
  id: 1,
  name: "Orders",
  type: "question",
  display: "table",
  collection_id: null,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
});

const PRODUCTS_QUESTION = createMockCard({
  id: 2,
  name: "Products",
  type: "question",
  display: "table",
  collection_id: null,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
  }),
});

const SCALAR_METRIC = createMockCard({
  id: 3,
  name: "Count of orders",
  type: "metric",
  display: "scalar",
  collection_id: null,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

const TIMESERIES_METRIC = createMockCard({
  id: 4,
  name: "Count of orders over time",
  type: "metric",
  display: "line",
  collection_id: null,
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
        breakouts: [{ type: "column", name: "CREATED_AT", unit: "month" }],
      },
    ],
  }),
});

const CARDS = [
  ORDERS_QUESTION,
  PRODUCTS_QUESTION,
  SCALAR_METRIC,
  TIMESERIES_METRIC,
];

const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const CREATED_AT_COLUMN = createMockDatetimeColumn({
  id: ORDERS.CREATED_AT,
  name: "CREATED_AT",
  display_name: "Created At: Month",
  source: "breakout",
  field_ref: [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ],
});

function createTableDataset(card: Card, value: string) {
  return createMockDataset({
    json_query: card.dataset_query,
    data: {
      rows: [[value]],
      cols: [createMockColumn({ name: "NAME", display_name: "Name" })],
    },
  });
}

// Like the real API, every card returns its own result
const DATASETS: Record<CardId, Dataset> = {
  [ORDERS_QUESTION.id]: createTableDataset(ORDERS_QUESTION, "Order row"),
  [PRODUCTS_QUESTION.id]: createTableDataset(PRODUCTS_QUESTION, "Product row"),
  [SCALAR_METRIC.id]: createMockDataset({
    json_query: SCALAR_METRIC.dataset_query,
    data: { rows: [[18760]], cols: [COUNT_COLUMN] },
  }),
  [TIMESERIES_METRIC.id]: createMockDataset({
    json_query: TIMESERIES_METRIC.dataset_query,
    data: {
      rows: [
        ["2025-01-01T00:00:00Z", 10],
        ["2025-02-01T00:00:00Z", 92],
        ["2025-03-01T00:00:00Z", 37],
      ],
      cols: [CREATED_AT_COLUMN, COUNT_COLUMN],
    },
  }),
};

function parseBody(body: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(body ?? "{}"));
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object body");
  }
  return parsed;
}

function setupQueryEndpoints() {
  // Saved dashcards run through the dashcard endpoint
  fetchMock.post(
    new RegExp(`/api/dashboard/${DASHBOARD_ID}/dashcard/\\d+/card/\\d+/query$`),
    (call) => {
      const cardId = Number(call.url.match(/\/card\/(\d+)\/query$/)?.[1]);
      return DATASETS[cardId] ?? { status: 404 };
    },
    { name: "dashcard-query" },
  );
  // A card added or swapped in during editing runs with the dashboard context
  // so the backend can apply the metric's default dimension (UXW-4769)
  fetchMock.post(
    /\/api\/card\/\d+\/query$/,
    (call) => {
      const cardId = Number(call.url.match(/\/card\/(\d+)\/query$/)?.[1]);
      const body = parseBody(call.options.body);
      if (body.dashboard_id !== DASHBOARD_ID) {
        return { status: 400 };
      }
      return DATASETS[cardId] ?? { status: 404 };
    },
    { name: "card-query" },
  );
}

// Like the real API, a PUT stores the dashcards it gets and gives new ones an id
function setupPersistedDashboardEndpoints(dashboard: Dashboard) {
  let persistedDashboard = dashboard;
  let nextDashcardId = 100;
  const toStoredDashcard = (value: unknown): DashboardCard => {
    const card = CARDS.find(
      ({ id }) => isObject(value) && id === value.card_id,
    );
    if (!isObject(value) || typeof value.id !== "number" || card == null) {
      throw new Error("Expected a saved question dashcard");
    }
    const visualizationSettings = isObject(value.visualization_settings)
      ? value.visualization_settings
      : {};
    return createMockDashboardCard({
      id: value.id < 0 ? nextDashcardId++ : value.id,
      dashboard_id: dashboard.id,
      card_id: card.id,
      card,
      row: typeof value.row === "number" ? value.row : 0,
      col: typeof value.col === "number" ? value.col : 0,
      size_x: typeof value.size_x === "number" ? value.size_x : 4,
      size_y: typeof value.size_y === "number" ? value.size_y : 4,
      visualization_settings: visualizationSettings,
    });
  };
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}`,
    () => persistedDashboard,
    { name: "get-dashboard" },
  );
  // Like the real API, the metadata lists the saved questions that the stored
  // click behaviors link to
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}/query_metadata`,
    () => {
      const linkedCardIds = persistedDashboard.dashcards.flatMap(
        ({ visualization_settings }) => {
          const clickBehavior: unknown = visualization_settings?.click_behavior;
          return isObject(clickBehavior) &&
            clickBehavior.type === "link" &&
            clickBehavior.linkType === "question" &&
            typeof clickBehavior.targetId === "number"
            ? [clickBehavior.targetId]
            : [];
        },
      );
      return createMockDashboardQueryMetadata({
        databases: [DATABASE],
        cards: CARDS.filter(({ id }) => linkedCardIds.includes(id)),
      });
    },
    { name: "dashboard-query-metadata" },
  );
  fetchMock.put(
    `path:/api/dashboard/${dashboard.id}`,
    (call) => {
      const body = parseBody(call.options.body);
      const savedDashcards: unknown = body.dashcards;
      persistedDashboard = {
        ...persistedDashboard,
        dashcards: Array.isArray(savedDashcards)
          ? savedDashcards.map(toStoredDashcard)
          : persistedDashboard.dashcards,
      };
      return persistedDashboard;
    },
    { name: "put-dashboard" },
  );
}

function setup({ dashcards }: { dashcards: DashboardCard[] }) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: "Metrics dashboard",
    collection_id: null,
    collection: createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    dashcards,
  });
  const rootCollection = createMockCollection({
    ...ROOT_COLLECTION,
    can_write: true,
  });

  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupPersistedDashboardEndpoints(dashboard);
  setupCollectionsEndpoints({ collections: [rootCollection] });
  setupCollectionItemsEndpoint({
    collection: rootCollection,
    collectionItems: CARDS.map((card) =>
      createMockCollectionItem({
        id: card.id,
        name: card.name,
        model: card.type === "metric" ? "metric" : "card",
        display: card.display,
        collection_id: null,
      }),
    ),
  });
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: PERSONAL_COLLECTION,
    collectionItems: [],
  });
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCardsEndpoints(CARDS);
  CARDS.forEach((card) =>
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [DATABASE] }),
    ),
  );
  setupBookmarksEndpoints([]);
  setupUserAttributesEndpoint([]);
  setupQueryEndpoints();

  const { router } = renderWithProviders(
    <>
      <Route path="/dashboard/:slug" element={<DashboardApp />} />
      <Route path="/question" element={<div data-testid="question-page" />} />
    </>,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      withUndos: true,
      storeInitialState: {
        currentUser: CURRENT_USER,
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        // The jsdom origin, so a question link opens in the app router
        settings: mockSettings({ "site-url": "http://localhost" }),
      },
    },
  );

  return { router: checkNotNull(router) };
}

function setupMetricSearchEndpoint() {
  fetchMock.get(
    "path:/api/search",
    (call) => {
      const params = new URL(call.url).searchParams;
      const isMetricSearch =
        params.get("q") === TIMESERIES_METRIC.name &&
        params.getAll("models").includes("metric");
      const data = isMetricSearch
        ? [
            createMockSearchResult({
              id: TIMESERIES_METRIC.id,
              name: TIMESERIES_METRIC.name,
              model: "metric",
              display: "line",
            }),
          ]
        : [];
      return { data, total: data.length, models: ["metric"] };
    },
    { name: "metric-search" },
  );
}

function createDashcard(id: number, card: Card, row: number) {
  return createMockDashboardCard({
    id,
    dashboard_id: DASHBOARD_ID,
    card_id: card.id,
    card,
    row,
    col: 0,
    size_x: 12,
    size_y: 4,
  });
}

function getDashcards() {
  return screen.getAllByTestId("dashcard");
}

describe("DashboardApp > metrics", () => {
  beforeEach(() => {
    // The entity picker only renders the list rows that fit its measured size
    mockGetBoundingClientRect({ width: 1200, height: 800 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("adds scalar and timeseries metrics through the questions sidebar and keeps them after saving", async () => {
    setup({
      dashcards: [
        createDashcard(10, ORDERS_QUESTION, 0),
        createDashcard(11, SCALAR_METRIC, 4),
      ],
    });
    setupMetricSearchEndpoint();
    await waitForDashboardToLoad();

    await userEvent.click(screen.getByLabelText("Edit dashboard"));
    await userEvent.click(screen.getByLabelText("Add questions"));

    const sidebar = await screen.findByTestId("add-card-sidebar");
    await userEvent.click(
      await within(sidebar).findByRole("menuitem", {
        name: SCALAR_METRIC.name,
      }),
    );
    await userEvent.type(
      within(sidebar).getByPlaceholderText("Search…"),
      TIMESERIES_METRIC.name,
    );
    // The browse list shows both metrics and a loader shows neither;
    // only the search results show the timeseries metric without the scalar one
    await waitFor(() => {
      expect(
        within(sidebar).getByText(TIMESERIES_METRIC.name),
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByText(SCALAR_METRIC.name),
      ).not.toBeInTheDocument();
    });
    await userEvent.click(within(sidebar).getByText(TIMESERIES_METRIC.name));
    const searchCall = fetchMock.callHistory.lastCall("metric-search");
    expect(new URL(String(searchCall?.url)).searchParams.get("q")).toBe(
      TIMESERIES_METRIC.name,
    );

    await assertTwoScalarMetricsAndATimeseriesMetric();
    const addedCardQueries = fetchMock.callHistory
      .calls("card-query")
      .map((call) => ({
        url: new URL(call.url).pathname,
        body: parseBody(call.options.body),
      }));
    expect(addedCardQueries).toEqual([
      {
        url: `/api/card/${SCALAR_METRIC.id}/query`,
        body: expect.objectContaining({ dashboard_id: DASHBOARD_ID }),
      },
      {
        url: `/api/card/${TIMESERIES_METRIC.id}/query`,
        body: expect.objectContaining({ dashboard_id: DASHBOARD_ID }),
      },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("put-dashboard")).toHaveLength(1),
    );
    const saveBody = parseBody(
      fetchMock.callHistory.lastCall("put-dashboard")?.options.body,
    );
    expect(saveBody.dashcards).toEqual([
      expect.objectContaining({ id: 10, card_id: ORDERS_QUESTION.id }),
      expect.objectContaining({ id: 11, card_id: SCALAR_METRIC.id }),
      expect.objectContaining({
        id: expect.any(Number),
        card_id: SCALAR_METRIC.id,
      }),
      expect.objectContaining({
        id: expect.any(Number),
        card_id: TIMESERIES_METRIC.id,
      }),
    ]);

    // The dashboard leaves editing once the save response, with the stored dashcards, lands
    expect(await screen.findByLabelText("Edit dashboard")).toBeInTheDocument();
    await assertTwoScalarMetricsAndATimeseriesMetric();
  });

  it("replaces a question with a metric and the metric with a question", async () => {
    setup({
      dashcards: [
        createDashcard(10, PRODUCTS_QUESTION, 0),
        createDashcard(11, ORDERS_QUESTION, 4),
      ],
    });
    await waitForDashboardToLoad();
    await userEvent.click(screen.getByLabelText("Edit dashboard"));

    const getOrdersDashcard = () => getDashcards()[1];
    expect(
      await within(getOrdersDashcard()).findByText("Order row"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(getOrdersDashcard()).getByLabelText("Replace"),
    );
    let picker = await screen.findByTestId("entity-picker-modal");
    await userEvent.click(await within(picker).findByText(SCALAR_METRIC.name));

    expect(await screen.findByText("Question replaced")).toBeInTheDocument();
    expect(
      await within(getOrdersDashcard()).findByTestId("scalar-value"),
    ).toHaveTextContent("18,760");
    expect(
      within(getOrdersDashcard()).getByText(SCALAR_METRIC.name),
    ).toBeInTheDocument();
    expect(within(getDashcards()[0]).getByText("Products")).toBeInTheDocument();
    const metricQuery = fetchMock.callHistory.lastCall("card-query");
    expect(new URL(String(metricQuery?.url)).pathname).toBe(
      `/api/card/${SCALAR_METRIC.id}/query`,
    );
    expect(parseBody(metricQuery?.options.body)).toEqual(
      expect.objectContaining({ dashboard_id: DASHBOARD_ID }),
    );

    await userEvent.click(
      within(getOrdersDashcard()).getByLabelText("Replace"),
    );
    picker = await screen.findByTestId("entity-picker-modal");
    expect(
      await within(picker).findByText(SCALAR_METRIC.name),
    ).toBeInTheDocument();
    await userEvent.click(within(picker).getByText(ORDERS_QUESTION.name));

    expect(await screen.findByText("Metric replaced")).toBeInTheDocument();
    expect(
      await within(getOrdersDashcard()).findByText(ORDERS_QUESTION.name),
    ).toBeInTheDocument();
    expect(
      await within(getOrdersDashcard()).findByText("Order row"),
    ).toBeInTheDocument();
    // Swapping the saved card back reruns it through its saved dashcard
    expect(
      fetchMock.callHistory
        .calls("dashcard-query")
        .map((call) => new URL(call.url).pathname)
        .filter((path) => path.includes("/dashcard/11/")),
    ).toEqual([
      `/api/dashboard/${DASHBOARD_ID}/dashcard/11/card/${ORDERS_QUESTION.id}/query`,
      `/api/dashboard/${DASHBOARD_ID}/dashcard/11/card/${ORDERS_QUESTION.id}/query`,
    ]);
    expect(
      within(getOrdersDashcard()).queryByTestId("scalar-value"),
    ).not.toBeInTheDocument();
  });
});

async function assertTwoScalarMetricsAndATimeseriesMetric() {
  await waitFor(() => expect(getDashcards()).toHaveLength(4));
  await waitFor(() =>
    expect(screen.getAllByTestId("scalar-value")).toHaveLength(2),
  );
  screen.getAllByTestId("scalar-value").forEach((value) => {
    expect(value).toHaveTextContent("18,760");
  });
  const grid = screen.getByTestId("dashboard-grid");
  expect(within(grid).getAllByText(SCALAR_METRIC.name)).toHaveLength(2);

  const getTimeseriesCards = () =>
    getDashcards().filter((dashcard) =>
      within(dashcard).queryByText(TIMESERIES_METRIC.name),
    );
  await waitFor(() => expect(getTimeseriesCards()).toHaveLength(1));
  const [timeseriesCard] = getTimeseriesCards();
  expect(
    await within(timeseriesCard).findByTestId("chart-container"),
  ).toBeInTheDocument();
  expect(
    within(timeseriesCard).getByTestId("visualization-root"),
  ).toHaveAttribute("data-viz-ui-name", "Line");
}
