import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupLastDownloadFormatEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
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
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import { GOAL_LINE_DASH } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  Dataset,
  DatasetColumn,
  Field,
  VisualizerColumnValueSource,
  VisualizerDashboardCard,
} from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCategoryColumn,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockField,
  createMockNumericColumn,
  createMockSearchResult,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

registerVisualizations();
registerDashboardVisualizations();

const DASHBOARD_ID = 10;
const DATABASE = createSampleDatabase();
const STRUCTURED_QUERY = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

const createdAtColumn = createMockDatetimeColumn({
  id: 101,
  name: "CREATED_AT",
  display_name: "Created At: Month",
  unit: "month",
});
const countColumn = createMockNumericColumn({
  id: undefined,
  name: "count",
  display_name: "Count",
  source: "aggregation",
});
const categoryColumn = createMockCategoryColumn({
  id: 102,
  name: "CATEGORY",
  display_name: "Product → Category",
});

const ORDERS_BY_CREATED_AT = createMockCard({
  id: 1,
  name: "Orders by Created At (Month)",
  display: "line",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
});
const PRODUCTS_BY_CREATED_AT = createMockCard({
  id: 2,
  name: "Products by Created At (Month)",
  display: "bar",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
});
const ORDERS_BY_CATEGORY = createMockCard({
  id: 3,
  name: "Orders by Product Category",
  display: "bar",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
});
const PRODUCTS_BY_CATEGORY = createMockCard({
  id: 4,
  name: "Products by Category",
  display: "bar",
  dataset_query: STRUCTURED_QUERY,
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
});
const STEP_COLUMN = createMockCard({
  id: 5,
  name: "Step Column",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.nativeQuery(
      DATABASE.id,
      SAMPLE_PROVIDER,
      "SELECT 'Landing page' AS \"Step\" UNION ALL SELECT 'Checkout page' UNION ALL SELECT 'Payment done page'",
    ),
  ),
});
const VIEWS_COLUMN = createMockCard({
  id: 6,
  name: "Views Column",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.nativeQuery(
      DATABASE.id,
      SAMPLE_PROVIDER,
      'SELECT 1000 AS "Views" UNION ALL SELECT 600 UNION ALL SELECT 100',
    ),
  ),
});
const ORDERS_TABLE = createMockCard({
  id: 7,
  name: "Orders",
  display: "table",
  dataset_query: STRUCTURED_QUERY,
});

const timeseriesDataset = (counts: [number, number, number]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [createdAtColumn, countColumn],
      rows: [
        ["2024-01-01T00:00:00Z", counts[0]],
        ["2024-02-01T00:00:00Z", counts[1]],
        ["2024-03-01T00:00:00Z", counts[2]],
      ],
    }),
  });

const categoryDataset = (counts: [number, number, number, number]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [categoryColumn, countColumn],
      rows: [
        ["Doohickey", counts[0]],
        ["Gadget", counts[1]],
        ["Gizmo", counts[2]],
        ["Widget", counts[3]],
      ],
    }),
  });

const ordersTableColumns: DatasetColumn[] = [
  createMockNumericColumn({
    id: 201,
    name: "ID",
    display_name: "ID",
    semantic_type: "type/PK",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 202,
    name: "USER_ID",
    display_name: "User ID",
    semantic_type: "type/FK",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 203,
    name: "SUBTOTAL",
    display_name: "Subtotal",
    base_type: "type/Float",
    effective_type: "type/Float",
    source: "fields",
  }),
  createMockNumericColumn({
    id: 204,
    name: "TOTAL",
    display_name: "Total",
    base_type: "type/Float",
    effective_type: "type/Float",
    source: "fields",
  }),
];

const DATASETS: Record<CardId, Dataset> = {
  [ORDERS_BY_CREATED_AT.id]: timeseriesDataset([10, 20, 30]),
  [PRODUCTS_BY_CREATED_AT.id]: timeseriesDataset([4, 5, 6]),
  [ORDERS_BY_CATEGORY.id]: categoryDataset([1, 2, 3, 4]),
  [PRODUCTS_BY_CATEGORY.id]: categoryDataset([5, 6, 7, 8]),
  [STEP_COLUMN.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [createMockCategoryColumn({ name: "Step", display_name: "Step" })],
      rows: [["Landing page"], ["Checkout page"], ["Payment done page"]],
    }),
  }),
  [VIEWS_COLUMN.id]: createMockDataset({
    data: createMockDatasetData({
      cols: [createMockNumericColumn({ name: "Views", display_name: "Views" })],
      rows: [[1000], [600], [100]],
    }),
  }),
  [ORDERS_TABLE.id]: createMockDataset({
    data: createMockDatasetData({
      cols: ordersTableColumns,
      rows: [
        [1, 11, 39.72, 42.0],
        [2, 12, 117.03, 120.5],
      ],
    }),
  }),
};

/** A query result column as the search API describes it in `result_metadata` */
const toResultMetadata = (column: DatasetColumn): Field =>
  createMockField({
    id: typeof column.id === "number" ? column.id : undefined,
    name: column.name,
    display_name: column.display_name,
    base_type: column.base_type,
    effective_type: column.effective_type,
    semantic_type: column.semantic_type ?? null,
  });

const columnRef = (
  name: string,
  originalName: string,
  card: Card,
): VisualizerColumnValueSource => ({
  name,
  originalName,
  sourceId: `card:${card.id}`,
});

const MULTI_SERIES_LINE_DASHCARD = createMockVisualizerDashboardCard({
  id: 11,
  dashboard_id: DASHBOARD_ID,
  card_id: ORDERS_BY_CREATED_AT.id,
  card: ORDERS_BY_CREATED_AT,
  series: [PRODUCTS_BY_CREATED_AT],
  row: 0,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "line",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CREATED_AT", ORDERS_BY_CREATED_AT)],
        COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CREATED_AT)],
        COLUMN_3: [columnRef("COLUMN_3", "CREATED_AT", PRODUCTS_BY_CREATED_AT)],
        COLUMN_4: [columnRef("COLUMN_4", "count", PRODUCTS_BY_CREATED_AT)],
      },
      settings: {
        "card.title": "My chart",
        "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
        "graph.metrics": ["COLUMN_2", "COLUMN_4"],
      },
    },
  },
});

const MULTI_SERIES_BAR_DASHCARD = createMockVisualizerDashboardCard({
  id: 12,
  dashboard_id: DASHBOARD_ID,
  card_id: ORDERS_BY_CATEGORY.id,
  card: ORDERS_BY_CATEGORY,
  series: [PRODUCTS_BY_CATEGORY],
  row: 0,
  col: 12,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "bar",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CATEGORY", ORDERS_BY_CATEGORY)],
        COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CATEGORY)],
        COLUMN_3: [columnRef("COLUMN_3", "CATEGORY", PRODUCTS_BY_CATEGORY)],
        COLUMN_4: [columnRef("COLUMN_4", "count", PRODUCTS_BY_CATEGORY)],
      },
      settings: {
        "card.title": "My category chart",
        "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
        "graph.metrics": ["COLUMN_2", "COLUMN_4"],
      },
    },
  },
});

const PIE_DASHCARD = createMockVisualizerDashboardCard({
  id: 13,
  dashboard_id: DASHBOARD_ID,
  card_id: PRODUCTS_BY_CATEGORY.id,
  card: PRODUCTS_BY_CATEGORY,
  series: [],
  row: 8,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "pie",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "CATEGORY", PRODUCTS_BY_CATEGORY)],
        COLUMN_2: [columnRef("COLUMN_2", "count", PRODUCTS_BY_CATEGORY)],
      },
      settings: {
        "card.title": "My pie chart",
        "pie.metric": "COLUMN_2",
        "pie.dimension": ["COLUMN_1"],
      },
    },
  },
});

const REGULAR_LINE_DASHCARD = createMockDashboardCard({
  id: 14,
  dashboard_id: DASHBOARD_ID,
  card_id: PRODUCTS_BY_CREATED_AT.id,
  card: PRODUCTS_BY_CREATED_AT,
  series: [],
  row: 8,
  col: 12,
  size_x: 12,
  size_y: 8,
});

const FUNNEL_DASHCARD = createMockVisualizerDashboardCard({
  id: 15,
  dashboard_id: DASHBOARD_ID,
  card_id: STEP_COLUMN.id,
  card: STEP_COLUMN,
  series: [VIEWS_COLUMN],
  row: 16,
  col: 0,
  size_x: 12,
  size_y: 8,
  visualization_settings: {
    visualization: {
      display: "funnel",
      columnValuesMapping: {
        COLUMN_1: [columnRef("COLUMN_1", "Step", STEP_COLUMN)],
        COLUMN_2: [columnRef("COLUMN_2", "Views", VIEWS_COLUMN)],
      },
      settings: {
        "card.title": "Regular visualizer funnel",
        "funnel.metric": "COLUMN_2",
        "funnel.dimension": "COLUMN_1",
      },
    },
  },
});

const VISUALIZER_DASHBOARD_DASHCARDS = [
  MULTI_SERIES_LINE_DASHCARD,
  MULTI_SERIES_BAR_DASHCARD,
  PIE_DASHCARD,
  REGULAR_LINE_DASHCARD,
  FUNNEL_DASHCARD,
];

const ALL_CARDS = [
  ORDERS_BY_CREATED_AT,
  PRODUCTS_BY_CREATED_AT,
  ORDERS_BY_CATEGORY,
  PRODUCTS_BY_CATEGORY,
  STEP_COLUMN,
  VIEWS_COLUMN,
  ORDERS_TABLE,
];

interface SetupOpts {
  dashcards: DashboardCard[];
  cards?: Card[];
  datasets?: Record<CardId, Dataset>;
}

type SavedDashcard = {
  id: number;
  card_id?: unknown;
  series?: unknown;
  visualization_settings?: unknown;
  row?: unknown;
  col?: unknown;
  size_x?: unknown;
  size_y?: unknown;
};

const LAYOUT_KEYS = ["row", "col", "size_x", "size_y"] as const;

function getSavedLayout(
  dashcard: SavedDashcard,
): Partial<Record<(typeof LAYOUT_KEYS)[number], number>> {
  return Object.fromEntries(
    LAYOUT_KEYS.flatMap((key) => {
      const value = dashcard[key];
      return typeof value === "number" ? [[key, value]] : [];
    }),
  );
}

const FIRST_NEW_DASHCARD_ID = 100;

function isSavedDashcard(value: unknown): value is SavedDashcard {
  return isObject(value) && typeof value.id === "number";
}

function parseSavedDashcards(body: unknown): SavedDashcard[] {
  if (!isObject(body) || !Array.isArray(body.dashcards)) {
    throw new Error("The dashboard save request has no dashcards");
  }
  return body.dashcards.filter(isSavedDashcard);
}

function getSeriesCardIds(series: unknown): number[] {
  return Array.isArray(series)
    ? series.flatMap((card: unknown) =>
        isObject(card) && typeof card.id === "number" ? [card.id] : [],
      )
    : [];
}

/**
 * Stands in for the dashboard API: a save stores the dashcards, gives new
 * dashcards an id and returns full cards, and a later load returns the save.
 */
function setupDashboardApi(
  initialDashboard: Dashboard,
  cards: Card[],
  datasets: Record<CardId, Dataset>,
) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  let savedDashboard = initialDashboard;
  let nextDashcardId = FIRST_NEW_DASHCARD_ID;

  fetchMock.post(
    "express:/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
    ({ expressParams }) => {
      const dashcard = savedDashboard.dashcards.find(
        ({ id }) => id === Number(expressParams?.dashcardId),
      );
      const cardId = Number(expressParams?.cardId);
      const belongsToDashcard =
        dashcard?.card_id === cardId ||
        (dashcard &&
          "series" in dashcard &&
          dashcard.series?.some(({ id }) => id === cardId));
      if (
        Number(expressParams?.dashboardId) !== savedDashboard.id ||
        !belongsToDashcard
      ) {
        return { status: 404, body: "Not found" };
      }
      return datasets[cardId] ?? { status: 404, body: "Not found" };
    },
    { name: "dashcard-query" },
  );
  fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, () => savedDashboard);
  fetchMock.put(
    `path:/api/dashboard/${DASHBOARD_ID}`,
    ({ options }) => {
      const body: unknown = JSON.parse(String(options.body));
      savedDashboard = {
        ...savedDashboard,
        dashcards: parseSavedDashcards(body).map((dashcard) => {
          const card = checkNotNull(cardsById.get(Number(dashcard.card_id)));
          return createMockDashboardCard({
            ...getSavedLayout(dashcard),
            id: dashcard.id < 0 ? nextDashcardId++ : dashcard.id,
            dashboard_id: DASHBOARD_ID,
            card_id: card.id,
            card,
            series: getSeriesCardIds(dashcard.series).map((id) =>
              checkNotNull(cardsById.get(id)),
            ),
            visualization_settings: isObject(dashcard.visualization_settings)
              ? { ...dashcard.visualization_settings }
              : {},
          });
        }),
      };
      return savedDashboard;
    },
    { name: "save-dashboard" },
  );
}

function setupEndpoints({
  dashcards,
  cards = ALL_CARDS,
  datasets = DATASETS,
}: SetupOpts) {
  const dashboard = createMockDashboard({
    id: DASHBOARD_ID,
    name: "Test Dashboard",
    dashcards,
    collection_id: null,
  });

  setupDashboardApi(dashboard, cards, datasets);
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([DATABASE]);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [DATABASE] }),
  );
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection(ROOT_COLLECTION),
    collectionItems: cards.map((card) =>
      createMockCollectionItem({
        id: card.id,
        name: card.name,
        model: "card",
        display: card.display,
      }),
    ),
  });
  setupBookmarksEndpoints([]);
  setupRecentViewsEndpoints([]);
  setupTimelinesEndpoints([]);
  setupLastDownloadFormatEndpoints();
  setupSearchEndpoints(
    cards.map((card) =>
      createMockSearchResult({
        id: card.id,
        name: card.name,
        model: "card",
        display: isCardDisplayType(card.display) ? card.display : null,
        result_metadata: datasets[card.id]?.data.cols.map(toResultMetadata),
      }),
    ),
  );

  cards.forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [DATABASE] }),
    );
  });

  const datasetFor = (cardId: string | undefined) =>
    datasets[Number(cardId)] ?? { status: 404, body: "Not found" };

  fetchMock.post(
    "express:/api/card/:cardId/query",
    ({ expressParams }) => datasetFor(expressParams?.cardId),
    { name: "card-query" },
  );
}

async function renderDashboard() {
  const view = renderWithProviders(
    <>
      <Route path="/dashboard/:slug" element={<DashboardApp />} />
      <Route path="/question/:slug" element={<div>Question page</div>} />
    </>,
    {
      initialRoute: `/dashboard/${DASHBOARD_ID}`,
      withRouter: true,
      storeInitialState: {
        dashboard: createMockDashboardState(),
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        settings: mockSettings({ "site-url": "http://localhost:3000" }),
      },
    },
  );
  // dashcards keep their own loading indicators until their queries return
  await waitFor(() => {
    expect(
      screen.queryByTestId("dashboard-grid-skeleton"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-header-skeleton"),
    ).not.toBeInTheDocument();
  });
  await screen.findByTestId("dashboard-header");
  return { ...view, router: checkNotNull(view.router) };
}

async function setup(opts: SetupOpts) {
  setupEndpoints(opts);
  return renderDashboard();
}

function queryDashcard(dashcardId: number) {
  return screen
    .queryAllByTestId("dashcard")
    .find(
      (dashcard) =>
        dashcard.getAttribute("data-dashcard-key") === String(dashcardId),
    );
}

function getDashcard(dashcardId: number) {
  return checkNotNull(queryDashcard(dashcardId));
}

/** Finds a dashcard once its query results are shown */
async function findDashcard(dashcardId: number) {
  await waitFor(() => {
    const dashcard = getDashcard(dashcardId);
    expect(
      within(dashcard).queryByTestId("loading-indicator"),
    ).not.toBeInTheDocument();
  });
  return getDashcard(dashcardId);
}

async function editDashboard() {
  await userEvent.click(screen.getByLabelText("Edit dashboard"));
  await screen.findByText("You're editing this dashboard.");
}

async function saveDashboard() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      screen.queryByText("You're editing this dashboard."),
    ).not.toBeInTheDocument(),
  );
}

async function openVisualizer(
  dashcardId: number,
  label: "Edit visualization" | "Visualize another way",
) {
  const dashcard = await findDashcard(dashcardId);
  await userEvent.click(await within(dashcard).findByLabelText(label));
  return findVisualizerModal();
}

async function findVisualizerModal() {
  await screen.findByTestId("visualizer-header");
  const modal = getVisualizerModal();
  await waitFor(() =>
    expect(
      within(modal).queryByTestId("visualization-canvas-loader"),
    ).not.toBeInTheDocument(),
  );
  return modal;
}

function getVisualizerModal() {
  return checkNotNull(
    screen
      .getAllByRole("dialog")
      .find(
        (dialog) => within(dialog).queryByTestId("visualizer-header") != null,
      ),
  );
}

async function saveVisualizer(label: "Save" | "Add to dashboard" = "Save") {
  await userEvent.click(
    within(getVisualizerModal()).getByRole("button", { name: label }),
  );
  await waitFor(() =>
    expect(screen.queryByTestId("visualizer-header")).not.toBeInTheDocument(),
  );
}

function getWellItems(wellTestId: string) {
  return within(screen.getByTestId(wellTestId))
    .queryAllByTestId("well-item")
    .map((item) => item.textContent);
}

async function addDataset(name: string) {
  const modal = getVisualizerModal();
  const addMoreDataButton = within(modal).queryByRole("button", {
    name: "Add more data",
  });
  if (addMoreDataButton) {
    await userEvent.click(addMoreDataButton);
  }
  const search = within(modal).getByPlaceholderText("Search for something");
  await userEvent.clear(search);
  await userEvent.type(search, name);
  const datasetsList = within(modal).getByTestId("datasets-list");
  await within(datasetsList).findByText(name);
  const item = getItemWithText(
    within(datasetsList).getAllByTestId("swap-dataset-button"),
    name,
  );
  expect(item).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(item);
  await waitFor(() => expect(item).toHaveAttribute("aria-pressed", "true"));
  // the data source is added once its query results are in
  await waitFor(() =>
    expect(
      within(getDataSourceItem(name)).getAllByTestId("column-list-item").length,
    ).toBeGreaterThan(0),
  );
}

function getItemWithText(items: HTMLElement[], text: string) {
  return checkNotNull(
    items.find((item) => within(item).queryByText(text) != null),
  );
}

function getColumnListItem(dataSourceItem: HTMLElement, columnName: string) {
  return getItemWithText(
    within(dataSourceItem).getAllByTestId("column-list-item"),
    columnName,
  );
}

function getDataSourceItem(name: string) {
  return checkNotNull(
    within(screen.getByTestId("visualizer-data-importer"))
      .queryAllByTestId("data-source-list-item")
      .find((item) => within(item).queryByText(name) != null),
  );
}

/** The names of the data sources in the visualizer, in their order */
function getDataSourceNames(candidateNames: string[]) {
  return within(screen.getByTestId("visualizer-data-importer"))
    .queryAllByTestId("data-source-list-item")
    .map((item) =>
      candidateNames.find((name) => within(item).queryByText(name) != null),
    );
}

function getSavedDashcards(): SavedDashcard[] {
  const call = fetchMock.callHistory.lastCall("save-dashboard");
  return parseSavedDashcards(JSON.parse(String(call?.options.body)));
}

/** The visualizer definition of a dashcard in the last dashboard save */
function getSavedVisualization(dashcardId: number): unknown {
  const dashcard = getSavedDashcards().find(({ id }) => id === dashcardId);
  const settings = dashcard?.visualization_settings;
  return isObject(settings) ? settings.visualization : undefined;
}

/** Hovering the title turns it into a link, so hover before clicking it. */
async function clickDashcardTitle(dashcardId: number) {
  await findDashcard(dashcardId);
  const getTitle = () =>
    within(getDashcard(dashcardId)).getByTestId("legend-caption-title");
  await userEvent.hover(getTitle());
  await userEvent.click(getTitle());
}

/** Finds a dashcard by its title once its query results are shown */
async function findDashcardByTitle(title: string) {
  const isLoadedWithTitle = (dashcard: HTMLElement) =>
    within(dashcard).queryByText(title, {
      selector: "[data-testid='legend-caption-title']",
    }) != null && within(dashcard).queryByTestId("loading-indicator") == null;
  await waitFor(() =>
    expect(screen.queryAllByTestId("dashcard").some(isLoadedWithTitle)).toBe(
      true,
    ),
  );
  return checkNotNull(
    screen.getAllByTestId("dashcard").find(isLoadedWithTitle),
  );
}

async function openVisualizerFromQuestionsSidebar(cardName: string) {
  await userEvent.click(screen.getByLabelText("Add questions"));
  const sidebar = await screen.findByTestId("add-card-sidebar");
  await within(sidebar).findByRole("menuitem", { name: cardName });
  // each question in the list is followed by its own "Visualize another way" button
  const questionNames = within(sidebar)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  const visualizeButtons = within(sidebar).getAllByLabelText(
    "Visualize another way",
  );
  await userEvent.click(
    checkNotNull(visualizeButtons.at(questionNames.indexOf(cardName))),
  );
  return findVisualizerModal();
}

function getGoalLine(container: HTMLElement) {
  return container.querySelector(
    `path[stroke-dasharray='${GOAL_LINE_DASH.join(",")}']`,
  );
}

async function hoverInfoIcon(dashcardId: number) {
  const dashcard = await findDashcard(dashcardId);
  await userEvent.hover(within(dashcard).getByLabelText("info icon"));
  return screen.findByRole("tooltip");
}

describe("DashboardApp > visualizer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("editing a dashcard", () => {
    it("should turn a question dashcard into a visualizer dashcard with another data source", async () => {
      await setup({ dashcards: [REGULAR_LINE_DASHCARD] });
      await editDashboard();

      const modal = await openVisualizer(
        REGULAR_LINE_DASHCARD.id,
        "Visualize another way",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue(
        PRODUCTS_BY_CREATED_AT.name,
      );

      await addDataset(ORDERS_BY_CREATED_AT.name);

      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${ORDERS_BY_CREATED_AT.name})`,
      ]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Month"]);
      expect(
        within(within(modal).getByLabelText("Legend")).getAllByTestId(
          "legend-item",
        ),
      ).toHaveLength(2);

      await saveVisualizer();

      const dashcard = getDashcard(REGULAR_LINE_DASHCARD.id);
      const legend = await within(dashcard).findByLabelText("Legend");
      expect(
        within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(legend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();

      await saveDashboard();

      const [savedDashcard] = getSavedDashcards();
      expect(savedDashcard).toMatchObject({
        id: REGULAR_LINE_DASHCARD.id,
        card_id: PRODUCTS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: ORDERS_BY_CREATED_AT.id })],
      });
      expect(getSavedVisualization(REGULAR_LINE_DASHCARD.id)).toEqual({
        display: "bar",
        columnValuesMapping: {
          COLUMN_1: [
            columnRef("COLUMN_1", "CREATED_AT", PRODUCTS_BY_CREATED_AT),
          ],
          COLUMN_2: [columnRef("COLUMN_2", "count", PRODUCTS_BY_CREATED_AT)],
          COLUMN_3: [columnRef("COLUMN_3", "count", ORDERS_BY_CREATED_AT)],
          COLUMN_4: [columnRef("COLUMN_4", "CREATED_AT", ORDERS_BY_CREATED_AT)],
        },
        settings: {
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
        },
      });

      const savedLegend = await within(
        await findDashcard(REGULAR_LINE_DASHCARD.id),
      ).findByLabelText("Legend");
      expect(
        within(savedLegend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(savedLegend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
    });

    it("should save a dashcard with a display the visualizer doesn't support as it is first shown", async () => {
      const tableDashcard = createMockDashboardCard({
        id: 21,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_TABLE.id,
        card: ORDERS_TABLE,
        size_x: 12,
        size_y: 8,
      });
      await setup({ dashcards: [tableDashcard] });
      await editDashboard();

      const dashcard = await findDashcard(tableDashcard.id);
      expect(
        within(dashcard).getByLabelText("Show visualization options"),
      ).toBeInTheDocument();

      const modal = await openVisualizer(
        tableDashcard.id,
        "Visualize another way",
      );
      const ordersSource = within(modal).getByTestId("data-source-list-item");
      const columnItem = (name: string) =>
        getColumnListItem(ordersSource, name);
      expect(columnItem("ID")).toHaveAttribute("aria-selected", "true");
      expect(columnItem("Subtotal")).toHaveAttribute("aria-selected", "true");
      expect(columnItem("Total")).toHaveAttribute("aria-selected", "false");
      expect(getWellItems("vertical-well")).toEqual(["Subtotal"]);
      expect(getWellItems("horizontal-well")).toEqual(["ID"]);
      expect(
        within(within(modal).getByTestId("viz-picker-main")).getByDisplayValue(
          "bar",
        ),
      ).toBeChecked();
      // an unchanged card can be saved, as its display came from the visualizer
      expect(within(modal).getByRole("button", { name: "Save" })).toBeEnabled();

      await saveVisualizer();

      expect(
        await within(dashcard).findByLabelText("Edit visualization"),
      ).toBeInTheDocument();
      expect(
        within(dashcard).queryByLabelText("Visualize another way"),
      ).not.toBeInTheDocument();
      expect(
        within(dashcard).queryByLabelText("Show visualization options"),
      ).not.toBeInTheDocument();

      const reopenedModal = await openVisualizer(
        tableDashcard.id,
        "Edit visualization",
      );
      expect(getWellItems("vertical-well")).toEqual(["Subtotal"]);
      expect(getWellItems("horizontal-well")).toEqual(["ID"]);
      expect(
        within(reopenedModal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();
    });

    it("should start pristine and enable saving only after a change (metabase#69038)", async () => {
      await setup({ dashcards: [MULTI_SERIES_LINE_DASHCARD] });
      await editDashboard();

      const modal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      // the data has loaded, so the card could be saved if it were changed
      await waitFor(() =>
        expect(getWellItems("vertical-well")).toHaveLength(2),
      );
      expect(
        within(modal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();

      // the preview table only renders the cells that fit in its measured size
      mockGetBoundingClientRect({ width: 800, height: 600 });
      await userEvent.click(
        within(modal).getByTestId("visualizer-view-as-table-button"),
      );
      const preview = await screen.findByTestId(
        "visualizer-tabular-preview-modal",
      );
      expect(
        await within(preview).findByRole("columnheader", { name: /^Count$/ }),
      ).toBeInTheDocument();
      await userEvent.click(within(preview).getByLabelText("Close"));
      await waitFor(() =>
        expect(
          screen.queryByTestId("visualizer-tabular-preview-modal"),
        ).not.toBeInTheDocument(),
      );

      expect(
        within(modal).getByRole("button", { name: "Save" }),
      ).toBeDisabled();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(
          screen.queryByTestId("visualizer-header"),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByText("Are you sure you want to leave?"),
      ).not.toBeInTheDocument();

      const reopenedModal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      await userEvent.click(within(reopenedModal).getByTestId("bar"));
      expect(
        within(reopenedModal).getByRole("button", { name: "Save" }),
      ).toBeEnabled();

      // a changed card asks before it closes
      await userEvent.keyboard("{Escape}");
      expect(
        await screen.findByText("Are you sure you want to leave?"),
      ).toBeInTheDocument();
    });

    it("should reset a data source to the card defaults", async () => {
      const lineDashcard = createMockVisualizerDashboardCard({
        id: 22,
        dashboard_id: DASHBOARD_ID,
        card_id: ORDERS_BY_CREATED_AT.id,
        card: ORDERS_BY_CREATED_AT,
        series: [],
        size_x: 12,
        size_y: 8,
        visualization_settings: {
          visualization: {
            display: "line",
            columnValuesMapping: {
              COLUMN_1: [
                columnRef("COLUMN_1", "CREATED_AT", ORDERS_BY_CREATED_AT),
              ],
              COLUMN_2: [columnRef("COLUMN_2", "count", ORDERS_BY_CREATED_AT)],
            },
            settings: {
              "graph.dimensions": ["COLUMN_1"],
              "graph.metrics": ["COLUMN_2"],
            },
          },
        },
      });
      await setup({ dashcards: [lineDashcard] });
      await editDashboard();

      let modal = await openVisualizer(lineDashcard.id, "Edit visualization");
      await userEvent.click(within(modal).getByTestId("pie"));
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);
      expect(getWellItems("pie-dimension-well")).toEqual(["Created At: Month"]);
      await saveVisualizer();
      await saveDashboard();
      expect(getSavedVisualization(lineDashcard.id)).toMatchObject({
        display: "pie",
      });

      await editDashboard();
      modal = await openVisualizer(lineDashcard.id, "Edit visualization");
      expect(getWellItems("pie-metric-well")).toEqual(["Count"]);

      const openResetItem = async () => {
        await userEvent.click(
          within(modal).getByLabelText("Datasource actions"),
        );
        return within(
          await screen.findByTestId("datasource-actions-dropdown"),
        ).getByLabelText("Reset data source");
      };

      const resetItem = await openResetItem();
      expect(resetItem).toBeEnabled();
      await userEvent.click(resetItem);

      await waitFor(() =>
        expect(
          within(
            within(modal).getByTestId("viz-picker-main"),
          ).getByDisplayValue("line"),
        ).toBeChecked(),
      );
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(getWellItems("horizontal-well")).toEqual(["Created At: Month"]);
      expect(await openResetItem()).toBeDisabled();
    });
  });

  describe("titles and descriptions", () => {
    it("should rename, describe and untitle dashcards (metabase#61457)", async () => {
      const { unmount } = await setup({
        dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
      });
      await editDashboard();

      // My chart -> Renamed chart, with a description
      let modal = await openVisualizer(
        MULTI_SERIES_LINE_DASHCARD.id,
        "Edit visualization",
      );
      const title = within(modal).getByTestId("visualizer-title");
      expect(title).toHaveValue("My chart");
      await userEvent.clear(title);
      await userEvent.type(title, "Renamed chart");
      await userEvent.tab();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      const description = within(modal).getByTestId("card.description");
      expect(description).toHaveValue("");
      await userEvent.type(description, "My description");
      await userEvent.tab();
      await saveVisualizer();
      expect(
        within(getDashcard(MULTI_SERIES_LINE_DASHCARD.id)).getByTestId(
          "legend-caption-title",
        ),
      ).toHaveTextContent("Renamed chart");

      // a question dashcard: card name -> Another chart
      modal = await openVisualizer(
        REGULAR_LINE_DASHCARD.id,
        "Visualize another way",
      );
      const regularTitle = within(modal).getByTestId("visualizer-title");
      expect(regularTitle).toHaveValue(PRODUCTS_BY_CREATED_AT.name);
      await userEvent.clear(regularTitle);
      await userEvent.type(regularTitle, "Another chart");
      await userEvent.tab();
      await saveVisualizer();
      await waitFor(() =>
        expect(
          within(getDashcard(REGULAR_LINE_DASHCARD.id)).getByTestId(
            "legend-caption-title",
          ),
        ).toHaveTextContent("Another chart"),
      );

      // My category chart and My pie chart -> no title
      for (const dashcardId of [
        MULTI_SERIES_BAR_DASHCARD.id,
        PIE_DASHCARD.id,
      ]) {
        modal = await openVisualizer(dashcardId, "Edit visualization");
        await userEvent.clear(within(modal).getByTestId("visualizer-title"));
        await userEvent.tab();
        expect(
          within(modal).getByRole("button", { name: "Save" }),
        ).toBeEnabled();
        await saveVisualizer();
        await waitFor(() =>
          expect(
            within(getDashcard(dashcardId)).getByTestId("legend-caption-title"),
          ).toHaveTextContent(/^$/),
        );
      }

      await saveDashboard();

      expect(
        getSavedVisualization(MULTI_SERIES_LINE_DASHCARD.id),
      ).toMatchObject({
        settings: {
          "card.title": "Renamed chart",
          "card.description": "My description",
        },
      });
      expect(getSavedVisualization(REGULAR_LINE_DASHCARD.id)).toMatchObject({
        settings: { "card.title": "Another chart" },
      });
      expect(getSavedVisualization(MULTI_SERIES_BAR_DASHCARD.id)).toMatchObject(
        { settings: { "card.title": "" } },
      );
      expect(getSavedVisualization(PIE_DASHCARD.id)).toMatchObject({
        settings: { "card.title": "" },
      });

      unmount();
      await renderDashboard();

      const expectedTitles = [
        [MULTI_SERIES_LINE_DASHCARD.id, "Renamed chart"],
        [MULTI_SERIES_BAR_DASHCARD.id, ""],
        [PIE_DASHCARD.id, ""],
        [REGULAR_LINE_DASHCARD.id, "Another chart"],
      ] as const;
      for (const [dashcardId, expectedTitle] of expectedTitles) {
        const dashcard = await findDashcard(dashcardId);
        expect(
          await within(dashcard).findByTestId("legend-caption-title"),
        ).toHaveTextContent(new RegExp(`^${expectedTitle}$`));
      }

      const tooltip = await hoverInfoIcon(MULTI_SERIES_LINE_DASHCARD.id);
      expect(tooltip).toHaveTextContent("My description");

      // an untitled card isn't renamed to a default title
      await editDashboard();
      modal = await openVisualizer(
        MULTI_SERIES_BAR_DASHCARD.id,
        "Edit visualization",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue("");
    });

    it("should offer the underlying questions in the menu of untitled dashcards only (metabase#61457)", async () => {
      const untitled = (
        dashcard: VisualizerDashboardCard,
      ): VisualizerDashboardCard => {
        const { visualization } = dashcard.visualization_settings;
        return {
          ...dashcard,
          visualization_settings: {
            visualization: {
              ...visualization,
              settings: { ...visualization.settings, "card.title": "" },
            },
          },
        };
      };
      const { router } = await setup({
        dashcards: [MULTI_SERIES_LINE_DASHCARD, untitled(PIE_DASHCARD)],
      });

      const titledDashcard = await findDashcard(MULTI_SERIES_LINE_DASHCARD.id);
      await userEvent.click(
        await within(titledDashcard).findByTestId("dashcard-menu"),
      );
      let menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Download results")).toBeInTheDocument();
      expect(
        within(menu).queryByText("View question(s)"),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );

      const untitledDashcard = await findDashcard(PIE_DASHCARD.id);
      await userEvent.click(
        await within(untitledDashcard).findByTestId("dashcard-menu"),
      );
      menu = await screen.findByRole("menu");
      expect(within(menu).getByText("Download results")).toBeInTheDocument();
      await userEvent.hover(within(menu).getByText("View question(s)"));
      const questions = await screen.findByTestId(
        "dashcard-menu-open-underlying-question",
      );
      await userEvent.click(
        within(questions).getByText(PRODUCTS_BY_CATEGORY.name),
      );

      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/question/${PRODUCTS_BY_CATEGORY.id}-products-by-category`,
        ),
      );
    });

    it("should propagate the original card title and description (metabase#63863, metabase#64340)", async () => {
      const questionWithDescription = createMockCard({
        ...ORDERS_BY_CREATED_AT,
        id: 30,
        name: "Original Question Title",
        description: "Original question description",
      });
      const questionDashcard = createMockDashboardCard({
        id: 31,
        dashboard_id: DASHBOARD_ID,
        card_id: questionWithDescription.id,
        card: questionWithDescription,
        size_x: 12,
        size_y: 8,
      });
      const { router, unmount } = await setup({
        dashcards: [questionDashcard],
        cards: [...ALL_CARDS, questionWithDescription],
        datasets: {
          ...DATASETS,
          [questionWithDescription.id]: timeseriesDataset([7, 8, 9]),
        },
      });

      const getTitle = () =>
        within(getDashcard(questionDashcard.id)).getByTestId(
          "legend-caption-title",
        );
      expect(
        await within(await findDashcard(questionDashcard.id)).findByText(
          "Original Question Title",
        ),
      ).toBeInTheDocument();
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Original question description",
      );

      await editDashboard();
      let modal = await openVisualizer(
        questionDashcard.id,
        "Visualize another way",
      );
      expect(within(modal).getByTestId("visualizer-title")).toHaveValue(
        "Original Question Title",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      expect(within(modal).getByTestId("card.description")).toHaveValue(
        "Original question description",
      );
      await userEvent.click(within(modal).getByTestId("bar"));
      await saveVisualizer();
      await saveDashboard();

      await waitFor(() =>
        expect(getTitle()).toHaveTextContent("Original Question Title"),
      );
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Original question description",
      );

      await clickDashcardTitle(questionDashcard.id);
      await waitFor(() =>
        expect(router.location.pathname).toMatch(
          new RegExp(`^/question/${questionWithDescription.id}-`),
        ),
      );

      unmount();
      await renderDashboard();
      await editDashboard();

      modal = await openVisualizer(questionDashcard.id, "Edit visualization");
      const title = within(modal).getByTestId("visualizer-title");
      expect(title).toHaveValue("Original Question Title");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Settings" }),
      );
      const description = within(modal).getByTestId("card.description");
      expect(description).toHaveValue("Original question description");

      await userEvent.clear(title);
      await userEvent.type(title, "Updated Title");
      await userEvent.tab();
      await userEvent.clear(description);
      await userEvent.type(description, "Updated description");
      await userEvent.tab();
      await saveVisualizer();
      await saveDashboard();

      expect(getSavedVisualization(questionDashcard.id)).toMatchObject({
        settings: {
          "card.title": "Updated Title",
          "card.description": "Updated description",
        },
      });
      await waitFor(() =>
        expect(getTitle()).toHaveTextContent("Updated Title"),
      );
      expect(await hoverInfoIcon(questionDashcard.id)).toHaveTextContent(
        "Updated description",
      );
    });

    it.each([
      {
        name: "the first series of a multi-series chart",
        dashcard: MULTI_SERIES_LINE_DASHCARD,
        menuItem: ORDERS_BY_CREATED_AT.name,
        path: `/question/${ORDERS_BY_CREATED_AT.id}-orders-by-created-at-month`,
      },
      {
        name: "the second series of a multi-series chart",
        dashcard: MULTI_SERIES_LINE_DASHCARD,
        menuItem: PRODUCTS_BY_CREATED_AT.name,
        path: `/question/${PRODUCTS_BY_CREATED_AT.id}-products-by-created-at-month`,
      },
      {
        name: "the first series of a funnel",
        dashcard: FUNNEL_DASHCARD,
        menuItem: STEP_COLUMN.name,
        path: `/question/${STEP_COLUMN.id}-step-column`,
      },
      {
        name: "the second series of a funnel",
        dashcard: FUNNEL_DASHCARD,
        menuItem: VIEWS_COLUMN.name,
        path: `/question/${VIEWS_COLUMN.id}-views-column`,
      },
    ])(
      "should open the question of $name from the dashcard title",
      async ({ dashcard, menuItem, path }) => {
        const { router } = await setup({
          dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
        });

        await within(await findDashcard(dashcard.id)).findByTestId(
          "legend-caption-title",
        );
        await clickDashcardTitle(dashcard.id);
        const menu = await screen.findByTestId("legend-caption-menu");
        await userEvent.click(within(menu).getByText(menuItem));

        await waitFor(() => expect(router.location.pathname).toBe(path));
      },
    );

    it("should open the question of a single-series pie chart from the dashcard title", async () => {
      const { router } = await setup({
        dashcards: VISUALIZER_DASHBOARD_DASHCARDS,
      });

      await within(await findDashcard(PIE_DASHCARD.id)).findByTestId(
        "legend-caption-title",
      );
      await clickDashcardTitle(PIE_DASHCARD.id);

      await waitFor(() =>
        expect(router.location.pathname).toBe(
          `/question/${PRODUCTS_BY_CATEGORY.id}-products-by-category`,
        ),
      );
    });
  });

  describe("creating a dashcard", () => {
    it("should navigate through the change history of the visualizer", async () => {
      await setup({ dashcards: [] });
      await editDashboard();

      const modal = await openVisualizerFromQuestionsSidebar(
        ORDERS_BY_CREATED_AT.name,
      );
      const undoButton = within(modal).getByLabelText("Undo");
      const redoButton = within(modal).getByLabelText("Redo");
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Add more data" }),
      );
      await userEvent.type(
        within(modal).getByPlaceholderText("Search for something"),
        "non-existing",
      );
      expect(
        await within(modal).findByText("No compatible results"),
      ).toBeInTheDocument();

      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      await userEvent.click(
        within(modal).getByRole("button", { name: "Done" }),
      );

      // undo adding a data source
      expect(redoButton).toBeDisabled();
      await userEvent.click(undoButton);
      expect(undoButton).toBeDisabled();
      expect(getDataSourceNames(ALL_CARDS.map(({ name }) => name))).toEqual([
        ORDERS_BY_CREATED_AT.name,
      ]);
      expect(getWellItems("vertical-well")).toHaveLength(1);

      // redo adding a data source
      await userEvent.click(redoButton);
      expect(redoButton).toBeDisabled();
      expect(getDataSourceNames(ALL_CARDS.map(({ name }) => name))).toEqual([
        ORDERS_BY_CREATED_AT.name,
        PRODUCTS_BY_CREATED_AT.name,
      ]);
      expect(getWellItems("vertical-well")).toHaveLength(2);

      // remove the Count column of the second data source
      const productsSource = getDataSourceItem(PRODUCTS_BY_CREATED_AT.name);
      const productsCount = getColumnListItem(productsSource, "Count");
      await userEvent.click(within(productsCount).getByLabelText("Remove"));
      expect(getWellItems("vertical-well")).toEqual(["Count"]);

      expect(redoButton).toBeDisabled();
      await userEvent.click(undoButton);
      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${PRODUCTS_BY_CREATED_AT.name})`,
      ]);
      await userEvent.click(redoButton);
      expect(redoButton).toBeDisabled();
      expect(getWellItems("vertical-well")).toEqual(["Count"]);

      // a goal line is a settings change
      const settingsButton = within(modal).getByRole("button", {
        name: "Settings",
      });
      await userEvent.click(settingsButton);
      expect(settingsButton).toHaveAttribute("aria-pressed", "true");
      const canvas = within(modal).getByTestId("visualization-canvas");
      expect(getGoalLine(canvas)).not.toBeInTheDocument();
      await userEvent.click(
        within(within(modal).getByTestId("chartsettings-sidebar")).getByText(
          "Goal line",
        ),
      );
      await waitFor(() => expect(getGoalLine(canvas)).toBeInTheDocument());

      await userEvent.click(undoButton);
      await waitFor(() => expect(getGoalLine(canvas)).not.toBeInTheDocument());
      // the open settings sidebar isn't part of the history
      expect(settingsButton).toHaveAttribute("aria-pressed", "true");

      await userEvent.click(redoButton);
      await waitFor(() => expect(getGoalLine(canvas)).toBeInTheDocument());

      await saveVisualizer("Add to dashboard");

      const dashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
      await userEvent.click(
        await within(dashcard).findByLabelText("Edit visualization"),
      );
      const reopenedModal = await findVisualizerModal();
      expect(within(reopenedModal).getByLabelText("Undo")).toBeDisabled();
      expect(within(reopenedModal).getByLabelText("Redo")).toBeDisabled();
      expect(
        within(reopenedModal).getByRole("button", { name: "Settings" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(getWellItems("vertical-well")).toEqual(["Count"]);
      expect(
        getGoalLine(within(reopenedModal).getByTestId("visualization-canvas")),
      ).toBeInTheDocument();
    });

    it("should store only the explicit settings of a new dashcard (VIZ-905)", async () => {
      const { unmount } = await setup({ dashcards: [] });
      await editDashboard();

      await openVisualizerFromQuestionsSidebar(ORDERS_BY_CREATED_AT.name);
      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      expect(getWellItems("vertical-well")).toEqual([
        "Count",
        `Count (${PRODUCTS_BY_CREATED_AT.name})`,
      ]);
      await saveVisualizer("Add to dashboard");
      await saveDashboard();

      const [savedDashcard] = getSavedDashcards();
      expect(savedDashcard).toMatchObject({
        card_id: ORDERS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: PRODUCTS_BY_CREATED_AT.id })],
      });
      expect(getSavedVisualization(savedDashcard.id)).toHaveProperty(
        "settings",
        {
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
        },
      );

      unmount();
      await renderDashboard();
      const legend = await within(
        await findDashcardByTitle(ORDERS_BY_CREATED_AT.name),
      ).findByLabelText("Legend");
      expect(
        within(legend).getByText(ORDERS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
      expect(
        within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
      ).toBeInTheDocument();
    });

    it("should add a data source to a dashcard after it is created (VIZ-926)", async () => {
      const { unmount } = await setup({ dashcards: [] });
      await editDashboard();

      await openVisualizerFromQuestionsSidebar(ORDERS_BY_CREATED_AT.name);
      await saveVisualizer("Add to dashboard");
      const newDashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
      await waitFor(() =>
        expect(
          within(newDashcard).getByText("Created At: Month"),
        ).toBeInTheDocument(),
      );
      await saveDashboard();

      const [createdDashcard] = getSavedDashcards();
      expect(createdDashcard.id).toBeLessThan(0);
      expect(getSeriesCardIds(createdDashcard.series)).toEqual([]);

      await editDashboard();
      const savedDashcard = await findDashcardByTitle(
        ORDERS_BY_CREATED_AT.name,
      );
      await userEvent.click(
        await within(savedDashcard).findByLabelText("Edit visualization"),
      );
      await findVisualizerModal();
      await addDataset(PRODUCTS_BY_CREATED_AT.name);
      expect(getWellItems("vertical-well")).toHaveLength(2);
      await saveVisualizer();

      const assertBothSeriesShown = async () => {
        const dashcard = await findDashcardByTitle(ORDERS_BY_CREATED_AT.name);
        const legend = await within(dashcard).findByLabelText("Legend");
        expect(
          within(legend).getByText(ORDERS_BY_CREATED_AT.name),
        ).toBeInTheDocument();
        expect(
          within(legend).getByText(PRODUCTS_BY_CREATED_AT.name),
        ).toBeInTheDocument();
        expect(
          within(dashcard).getByTestId("legend-caption-title"),
        ).toHaveTextContent(ORDERS_BY_CREATED_AT.name);
        expect(
          within(dashcard).getByText("Created At: Month"),
        ).toBeInTheDocument();
      };
      await assertBothSeriesShown();

      await saveDashboard();
      const [updatedDashcard] = getSavedDashcards();
      expect(updatedDashcard).toMatchObject({
        id: FIRST_NEW_DASHCARD_ID,
        card_id: ORDERS_BY_CREATED_AT.id,
        series: [expect.objectContaining({ id: PRODUCTS_BY_CREATED_AT.id })],
      });
      await assertBothSeriesShown();

      unmount();
      await renderDashboard();
      await assertBothSeriesShown();
      const queryTargets = fetchMock.callHistory
        .calls("dashcard-query")
        .map(({ url }) => new URL(url).pathname);
      for (const card of [ORDERS_BY_CREATED_AT, PRODUCTS_BY_CREATED_AT]) {
        expect(queryTargets).toContain(
          `/api/dashboard/${DASHBOARD_ID}/dashcard/${FIRST_NEW_DASHCARD_ID}/card/${card.id}/query`,
        );
      }
    });
  });

  describe("broken data sources", () => {
    const BASE_QUESTION = createMockCard({
      id: 40,
      name: "Base question",
      display: "scalar",
      dataset_query: STRUCTURED_QUERY,
    });
    const INVALID_QUESTION = createMockCard({
      id: 41,
      name: "Invalid question",
      display: "scalar",
      dataset_query: STRUCTURED_QUERY,
    });
    const scalarDataset = (value: number) =>
      createMockDataset({
        data: createMockDatasetData({
          cols: [createMockNumericColumn({ name: "1", display_name: "1" })],
          rows: [[value]],
        }),
      });
    // H2 runs the "broken" `SELECT --2` of the e2e test and returns no columns
    const noColumnsDataset = createMockDataset({
      data: createMockDatasetData({ cols: [], rows: [] }),
    });
    const CARDS = [...ALL_CARDS, BASE_QUESTION, INVALID_QUESTION];
    const FUNNEL_DASHCARD_WITH_INVALID_QUESTION =
      createMockVisualizerDashboardCard({
        id: 43,
        dashboard_id: DASHBOARD_ID,
        card_id: BASE_QUESTION.id,
        card: BASE_QUESTION,
        series: [INVALID_QUESTION],
        size_x: 16,
        size_y: 10,
        visualization_settings: {
          visualization: {
            display: "funnel",
            columnValuesMapping: {
              METRIC: [
                columnRef("COLUMN_1", "1", BASE_QUESTION),
                columnRef("COLUMN_2", "1", INVALID_QUESTION),
              ],
              DIMENSION: [
                `$_card:${BASE_QUESTION.id}_name`,
                `$_card:${INVALID_QUESTION.id}_name`,
              ],
            },
            settings: {
              "funnel.metric": "METRIC",
              "funnel.dimension": "DIMENSION",
            },
          },
        },
      });

    it("should add a second question to a scalar dashcard (metabase#22265)", async () => {
      const baseDashcard = createMockDashboardCard({
        id: 42,
        dashboard_id: DASHBOARD_ID,
        card_id: BASE_QUESTION.id,
        card: BASE_QUESTION,
        size_x: 16,
        size_y: 10,
      });
      const { unmount } = await setup({
        dashcards: [baseDashcard],
        cards: CARDS,
        datasets: {
          ...DATASETS,
          [BASE_QUESTION.id]: scalarDataset(1),
          [INVALID_QUESTION.id]: scalarDataset(1),
        },
      });
      await editDashboard();

      const modal = await openVisualizer(
        baseDashcard.id,
        "Visualize another way",
      );
      await addDataset(INVALID_QUESTION.name);
      expect(
        await within(modal).findByTestId("funnel-chart"),
      ).toHaveTextContent(INVALID_QUESTION.name);

      const metadataCallsBefore = fetchMock.callHistory.calls(
        "express:/api/card/:cardId/query_metadata",
      ).length;
      await saveVisualizer();

      await waitFor(() =>
        expect(
          fetchMock.callHistory
            .calls("express:/api/card/:cardId/query_metadata")
            .slice(metadataCallsBefore)
            .map(({ url }) => new URL(url).pathname)
            .sort(),
        ).toEqual([
          `/api/card/${BASE_QUESTION.id}/query_metadata`,
          `/api/card/${INVALID_QUESTION.id}/query_metadata`,
        ]),
      );
      await saveDashboard();
      unmount();
      await renderDashboard();
      expect(
        await within(getDashcard(baseDashcard.id)).findByText(
          INVALID_QUESTION.name,
        ),
      ).toBeInTheDocument();
      expect(getSavedVisualization(baseDashcard.id)).toMatchObject({
        display: "funnel",
        settings: {
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      });
    });

    it("should edit a dashcard whose added question has lost its columns (metabase#22265, VIZ-676)", async () => {
      const funnelDashcard = FUNNEL_DASHCARD_WITH_INVALID_QUESTION;
      await setup({
        dashcards: [funnelDashcard],
        cards: CARDS,
        datasets: {
          ...DATASETS,
          [BASE_QUESTION.id]: scalarDataset(1),
          [INVALID_QUESTION.id]: noColumnsDataset,
        },
      });
      await editDashboard();

      const dashcard = await findDashcard(funnelDashcard.id);
      // the dashcard title and the funnel step
      await waitFor(() =>
        expect(within(dashcard).getAllByText(BASE_QUESTION.name)).toHaveLength(
          2,
        ),
      );
      expect(
        within(dashcard).getByText(INVALID_QUESTION.name),
      ).toBeInTheDocument();
      expect(within(dashcard).getByText("1")).toBeInTheDocument();

      await userEvent.click(
        within(dashcard).getByLabelText("Edit visualization"),
      );
      await findVisualizerModal();
      await waitFor(() =>
        expect(getDataSourceNames(CARDS.map(({ name }) => name))).toEqual([
          BASE_QUESTION.name,
          INVALID_QUESTION.name,
        ]),
      );
    });

    // Remove .failing once a failed series no longer hides "Edit visualization"
    it.failing(
      "should edit a dashcard whose added question fails to run (metabase#22265)",
      async () => {
        const funnelDashcard = FUNNEL_DASHCARD_WITH_INVALID_QUESTION;
        await setup({
          dashcards: [funnelDashcard],
          cards: CARDS,
          datasets: {
            ...DATASETS,
            [BASE_QUESTION.id]: scalarDataset(1),
            // the backend's error shape (catch_exceptions.clj)
            [INVALID_QUESTION.id]: createMockDataset({
              status: "failed",
              error: "Syntax error",
              data: createMockDatasetData({ cols: [], rows: [] }),
            }),
          },
        });
        await editDashboard();

        const dashcard = await findDashcard(funnelDashcard.id);
        expect(
          await within(dashcard).findByText(
            "Some columns are missing, this card might not render correctly.",
          ),
        ).toBeInTheDocument();
        expect(
          within(dashcard).getByLabelText("Edit visualization"),
        ).toBeInTheDocument();
      },
    );
  });
});
