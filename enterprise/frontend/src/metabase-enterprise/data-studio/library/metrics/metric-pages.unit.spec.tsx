import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryEndpoint,
  setupAdhocQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupMetricDatasetEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { setupAuditInfoEndpoint } from "__support__/server-mocks/audit";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupCustomVizPluginListEndpoint } from "__support__/server-mocks/custom-viz-plugin";
import { setupLibraryEndpoints } from "__support__/server-mocks/library";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderRoutes,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { getMetricRoutes } from "metabase/metrics/routes";
import { Route, toRouteObjects } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { CacheConfig, Card, Collection } from "metabase-types/api";
import {
  createMockCacheConfigWithDoNotCacheStrategy,
  createMockCard,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockCollectionItem,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockDependencyGraph,
  createMockMetric,
  createMockNumericColumn,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import { getDataStudioMetricRoutes } from "./routes";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;
// The id of the card that a create or a duplicate request returns
const NEW_CARD_ID = 43;
const QUESTION_OVERVIEW_DASHBOARD_ID = 201;

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: 10,
  name: "Metrics",
  type: "library-metrics",
  can_write: true,
});

const FIRST_COLLECTION_ID = 11;
const FIRST_COLLECTION = createMockCollection({
  id: FIRST_COLLECTION_ID,
  name: "First collection",
  location: "/",
  can_write: true,
});

// The e2e tests ran with a pro-self-hosted token, which has every feature
const ALL_TOKEN_FEATURES = Object.fromEntries(
  Object.keys(createMockTokenFeatures()).map((feature) => [feature, true]),
);

const COUNT_QUERY = Lib.createTestJsQuery(SAMPLE_PROVIDER, {
  stages: [
    {
      source: { type: "table", id: ORDERS_ID },
      aggregations: [{ type: "operator", operator: "count", args: [] }],
    },
  ],
});

const SCALAR_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockNumericColumn({ name: "count" })],
    rows: [[18760]],
  }),
});

type SetupOpts = {
  initialRoute: string;
  collection?: Collection;
  cacheConfigs?: CacheConfig[];
  /** Delays the database and table detail responses that the Source rows read */
  detailsResponseDelayMs?: number;
  /** Serves dependency graphs with dependencies and dependents */
  hasRelationships?: boolean;
};

function setup({
  initialRoute,
  collection = createMockCollection(),
  cacheConfigs = [],
  detailsResponseDelayMs = 0,
  hasRelationships = false,
}: SetupOpts) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(ALL_TOKEN_FEATURES),
  });
  setupEnterprisePlugins();

  const card: Card = createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Orders count",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    can_write: true,
    collection,
    collection_id: typeof collection.id === "number" ? collection.id : null,
    result_metadata: [
      createMockColumn({ name: "count", base_type: "type/Integer" }),
    ],
    dataset_query: COUNT_QUERY,
  });
  const queryMetadata = createMockCardQueryMetadata({ databases: [SAMPLE_DB] });
  const collections = [collection, FIRST_COLLECTION];

  if (detailsResponseDelayMs > 0) {
    // Registered first, so they answer before the routes of the helpers below
    const ordersTable = SAMPLE_DB.tables?.find(({ id }) => id === ORDERS_ID);
    fetchMock.get(`path:/api/database/${SAMPLE_DB_ID}`, SAMPLE_DB, {
      delay: detailsResponseDelayMs,
    });
    fetchMock.get(`path:/api/table/${ORDERS_ID}`, ordersTable ?? {}, {
      delay: detailsResponseDelayMs,
    });
  }
  setupDatabasesEndpoints([SAMPLE_DB]);
  setupCardStore(card, collections);
  setupAdhocQueryMetadataEndpoint(queryMetadata);
  fetchMock.get("express:/api/card/:id/query_metadata", queryMetadata);
  fetchMock.post("express:/api/card/:id/query", SCALAR_DATASET);
  fetchMock.get("express:/api/card/:id/series", []);
  fetchMock.get("express:/api/metric/:id", ({ expressParams }) =>
    createMockMetric({ id: Number(expressParams?.id) }),
  );
  setupMetricDatasetEndpoint(SCALAR_DATASET);
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: CARD_ID }, []);
  setupListNotificationEndpoints({ card_id: NEW_CARD_ID }, []);
  setupPerformanceEndpoints(cacheConfigs);
  setupAuditInfoEndpoint({
    auditInfo: { question_overview: QUESTION_OVERVIEW_DASHBOARD_ID },
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupGraphEndpoint({ hasRelationships });
  setupCustomVizPluginListEndpoint([]);

  return renderRoutes(
    toRouteObjects(
      <Route>
        {getMetricRoutes()}
        <Route path="data-studio/library">{getDataStudioMetricRoutes()}</Route>
      </Route>,
    ),
    {
      initialRoute,
      withUndos: true,
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

function parseCardRequestBody(body: unknown): Partial<Card> {
  const parsedBody: unknown = JSON.parse(String(body));
  // The pages under test build create and update requests from Card fields
  return isObject(parsedBody) ? (parsedBody as Partial<Card>) : {};
}

// The cards that the backend stores. A create request adds the new metric as
// NEW_CARD_ID and an update request changes the stored card, so the pages
// read what the requests wrote.
function setupCardStore(initialCard: Card, collections: Collection[]) {
  const cards = new Map<number, Card>([[initialCard.id, initialCard]]);

  fetchMock.get(
    "express:/api/card/:id",
    ({ expressParams }) =>
      cards.get(Number(expressParams?.id)) ?? { status: 404, body: {} },
    { name: "card-get" },
  );
  fetchMock.put(
    "express:/api/card/:id",
    ({ expressParams, options }) => {
      const id = Number(expressParams?.id);
      const storedCard = cards.get(id);
      if (!storedCard) {
        return { status: 404, body: {} };
      }
      const changes = parseCardRequestBody(options.body);
      const updatedCard = { ...storedCard, ...changes };
      cards.set(id, updatedCard);
      return updatedCard;
    },
    { name: "card-put" },
  );
  fetchMock.post(
    "path:/api/card",
    ({ options }) => {
      const body = parseCardRequestBody(options.body);
      if (body.type !== "metric") {
        return { status: 400, body: {} };
      }
      const newCard = createMockCard({
        ...body,
        id: NEW_CARD_ID,
        database_id: SAMPLE_DB_ID,
        table_id: ORDERS_ID,
        can_write: true,
        collection: collections.find(({ id }) => id === body.collection_id),
      });
      cards.set(NEW_CARD_ID, newCard);
      return newCard;
    },
    { name: "card-create" },
  );
}

const ORDERS_TABLE_NODE = createMockTableDependencyNode({
  id: ORDERS_ID,
  data: createMockTableDependencyNodeData({
    name: "orders",
    display_name: "Orders",
    db_id: SAMPLE_DB_ID,
  }),
});

const METRIC_NODE = createMockCardDependencyNode({
  id: CARD_ID,
  data: createMockCardDependencyNodeData({
    name: "Orders count",
    type: "metric",
    display: "scalar",
  }),
  dependents_count: {},
});

const DEPENDENCY_CARD_ID = 7;

type SetupGraphEndpointOpts = {
  hasRelationships: boolean;
};

// Serves the graphs of the stored metric and of the metric that a create or
// duplicate request returns, and 404 for any other entity
function setupGraphEndpoint({ hasRelationships }: SetupGraphEndpointOpts) {
  fetchMock.get(
    "path:/api/ee/dependencies/graph",
    (call) => {
      const params = new URL(call.url).searchParams;
      const id = Number(params.get("id"));
      const isMetric =
        params.get("type") === "card" && [CARD_ID, NEW_CARD_ID].includes(id);
      if (!isMetric) {
        return { status: 404 };
      }
      const metricNode = createMockCardDependencyNode({
        ...METRIC_NODE,
        id,
        dependents_count: hasRelationships ? { question: 2 } : {},
      });
      return createMockDependencyGraph({
        nodes: [metricNode, ORDERS_TABLE_NODE],
        edges: [
          {
            from_entity_id: id,
            from_entity_type: "card",
            to_entity_id: ORDERS_ID,
            to_entity_type: "table",
          },
          ...(hasRelationships
            ? [
                {
                  from_entity_id: DEPENDENCY_CARD_ID,
                  from_entity_type: "card" as const,
                  to_entity_id: id,
                  to_entity_type: "card" as const,
                },
              ]
            : []),
        ],
      });
    },
    { name: "dependency-graph" },
  );
}

async function waitForGraphResponse(cardId: number) {
  await waitFor(() => {
    const graphCall = fetchMock.callHistory
      .calls("dependency-graph")
      .find(
        (call) => new URL(call.url).searchParams.get("id") === String(cardId),
      );
    expect(graphCall?.response?.status).toBe(200);
  });
}

// The pickers list their items with @tanstack/react-virtual, which renders
// nothing in jsdom without element sizes.
function setupPickerEndpoints() {
  mockGetBoundingClientRect();
  setupSearchEndpoints([]);
  setupTableQueryMetadataEndpoint(createOrdersTable());
  setupRootCollectionItemsEndpoint({
    rootCollectionItems: [
      createMockCollectionItem({
        id: FIRST_COLLECTION_ID,
        model: "collection",
        name: FIRST_COLLECTION.name,
        collection_id: null,
        can_write: true,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: FIRST_COLLECTION,
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: LIBRARY_METRICS_COLLECTION,
    collectionItems: [],
  });
  setupLibraryEndpoints();
  fetchMock.get("path:/api/user/recipients", { data: [] });
}

async function openMoreMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "More options" }),
  );
  return screen.findByRole("menu");
}

async function getRequestBody(name: string): Promise<unknown> {
  await waitFor(() => {
    expect(fetchMock.callHistory.calls(name)).toHaveLength(1);
  });
  const body: unknown = JSON.parse(
    String(fetchMock.callHistory.lastCall(name)?.options.body),
  );
  return body;
}

async function getSummarizeStep() {
  return screen.findByTestId("step-summarize-0-0");
}

async function changeCountToSumOfTotal() {
  const step = within(await getSummarizeStep());
  await userEvent.click(await step.findByText("Count"));
  const popover = within(await screen.findByRole("dialog"));
  await userEvent.click(await popover.findByText("Sum of ..."));
  await userEvent.click(await popover.findByText("Total"));
}

async function pickFromMiniPicker(path: string[]) {
  const miniPicker = await screen.findByTestId("mini-picker");
  for (const name of path) {
    await userEvent.click(await within(miniPicker).findByText(name));
  }
}

describe("metric pages (EE)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Open in Data Studio", () => {
    it("is offered on the metric page of a library metric", async () => {
      setup({
        initialRoute: `/metric/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
      });

      await screen.findByTestId("metric-about-page");
      const menu = await openMoreMenu();
      expect(within(menu).getByText("Open in Data Studio")).toBeInTheDocument();
    });

    it("is not offered on the Data Studio page of the same metric", async () => {
      setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
      });

      await screen.findByTestId("metric-about-page");
      const menu = await openMoreMenu();
      expect(within(menu).getByText("Bookmark")).toBeInTheDocument();
      expect(
        within(menu).queryByText("Open in Data Studio"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows the dependency graph in the Dependencies tab and links to the usage analytics", async () => {
    const { router } = setup({
      initialRoute: `/metric/${CARD_ID}`,
    });

    const sidebar = within(
      await screen.findByTestId("metric-description-sidebar"),
    );
    expect(await sidebar.findByText("Relationships")).toBeInTheDocument();
    expect(await sidebar.findByText("No dependencies")).toBeInTheDocument();
    expect(sidebar.getByText("No charts use this metric")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("tab", {
        name: "Dependencies",
      }),
    );
    expect(router?.location.pathname).toBe(`/metric/${CARD_ID}/dependencies`);
    const graph = within(await screen.findByTestId("dependency-graph"));
    await waitFor(() => {
      expect(
        graph
          .getAllByTestId("graph-node")
          .map((node) => node.getAttribute("aria-label")),
      ).toEqual(expect.arrayContaining(["Orders", "Orders count"]));
    });
    expect(graph.getByText("Table")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId("metric-header")).getByRole("tab", {
        name: "About",
      }),
    );
    await screen.findByTestId("metric-about-page");
    const menu = await openMoreMenu();
    expect(
      await within(menu).findByRole("menuitem", {
        name: /Metric usage analytics/,
      }),
    ).toHaveAttribute(
      "href",
      `/dashboard/${QUESTION_OVERVIEW_DASHBOARD_ID}?question_id=${CARD_ID}`,
    );
  });

  describe("Data Studio library", () => {
    it("creates a metric in the Metrics collection, opens its page, and runs its definition", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      setupPickerEndpoints();
      setupAdhocQueryEndpoint(SCALAR_DATASET, {
        body: {
          database: SAMPLE_DB_ID,
          stages: [{ "source-table": ORDERS_ID, aggregation: [["count"]] }],
        },
        matchPartialBody: true,
      });
      const { router } = setup({
        initialRoute: `/data-studio/library/metrics/new?collectionId=${LIBRARY_METRICS_COLLECTION.id}`,
        collection: LIBRARY_METRICS_COLLECTION,
        detailsResponseDelayMs: 600,
      });

      const editor = within(await screen.findByTestId("metric-query-editor"));
      expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();

      await pickFromMiniPicker(["Browse all"]);
      const dataPicker = within(
        await screen.findByTestId("entity-picker-modal"),
      );
      await userEvent.click(await dataPicker.findByText("Databases"));
      await userEvent.click(await dataPicker.findByText("Sample Database"));
      await userEvent.click(await dataPicker.findByText("Orders"));
      const saveButton = editor.getByRole("button", { name: "Save" });
      await waitFor(() => expect(saveButton).toBeEnabled());
      await userEvent.click(saveButton);

      const modal = within(
        await screen.findByRole("dialog", { name: "Save your metric" }),
      );
      const nameInput = modal.getByLabelText("Name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Total Revenue");
      await userEvent.type(
        modal.getByLabelText("Description"),
        "Sum of all order totals across the store",
      );
      expect(
        modal.getByText("Where do you want to save this?"),
      ).toBeInTheDocument();
      expect(
        await modal.findByText(LIBRARY_METRICS_COLLECTION.name),
      ).toBeInTheDocument();
      await userEvent.click(modal.getByRole("button", { name: "Save" }));

      expect(await getRequestBody("card-create")).toMatchObject({
        name: "Total Revenue",
        description: "Sum of all order totals across the store",
        collection_id: LIBRARY_METRICS_COLLECTION.id,
        type: "metric",
        display: "scalar",
        dataset_query: {
          database: SAMPLE_DB_ID,
          stages: [
            {
              "source-table": ORDERS_ID,
              aggregation: [["count", expect.any(Object)]],
            },
          ],
        },
      });
      await waitFor(() => {
        expect(trackSimpleEvent).toHaveBeenCalledWith({
          event: "metric_created",
          triggered_from: "data_studio",
          result: "success",
          target_id: NEW_CARD_ID,
        });
      });

      const aboutPage = within(await screen.findByTestId("metric-about-page"));
      expect(router?.location.pathname).toBe(
        `/data-studio/library/metrics/${NEW_CARD_ID}`,
      );
      // breadcrumbs + header
      await waitFor(() => {
        expect(aboutPage.getAllByText("Total Revenue")).toHaveLength(2);
      });
      expect(
        aboutPage.getByText("Sum of all order totals across the store"),
      ).toBeInTheDocument();
      const sidebar = within(
        aboutPage.getByTestId("metric-description-sidebar"),
      );
      expect(await sidebar.findByText(/^Last updated/)).toBeVisible();
      expect(await sidebar.findByText("Source")).toBeVisible();
      expect(await sidebar.findByText("Sample Database")).toBeVisible();
      expect(await sidebar.findByText("Orders")).toBeVisible();
      expect(await sidebar.findByText("Relationships")).toBeVisible();
      await waitForGraphResponse(NEW_CARD_ID);
      expect(sidebar.getByText("No dependencies")).toBeVisible();
      expect(sidebar.getByText("No charts use this metric")).toBeVisible();

      await userEvent.click(
        within(screen.getByTestId("metric-header")).getByRole("tab", {
          name: "Definition",
        }),
      );
      expect(router?.location.pathname).toBe(
        `/data-studio/library/metrics/${NEW_CARD_ID}/query`,
      );
      expect(
        await within(await screen.findByTestId("step-data-0-0")).findByText(
          "Orders",
        ),
      ).toBeInTheDocument();
      expect(
        within(await getSummarizeStep()).getByText("Count"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(await screen.findByTestId("run-button-overlay")).getByTestId(
          "run-button",
        ),
      );
      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        "18,760",
      );
    });

    it("shows the relationship counts from the dependency graph of the metric", async () => {
      setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
        hasRelationships: true,
      });

      const sidebar = within(
        await screen.findByTestId("metric-description-sidebar"),
      );
      expect(await sidebar.findByText("1 dependency")).toBeVisible();
      expect(sidebar.getByText("2 charts")).toBeVisible();
      expect(sidebar.queryByText("No dependencies")).not.toBeInTheDocument();
      expect(
        sidebar.queryByText("No charts use this metric"),
      ).not.toBeInTheDocument();
    });

    it("keeps unsaved definition changes when leaving is cancelled, and reverts them on Cancel", async () => {
      const { router } = setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}/query`,
        collection: LIBRARY_METRICS_COLLECTION,
      });
      const editor = within(await screen.findByTestId("metric-query-editor"));

      await changeCountToSumOfTotal();
      expect(await editor.findByRole("button", { name: "Save" })).toBeEnabled();
      await userEvent.click(editor.getByRole("button", { name: "Cancel" }));
      expect(
        await within(await getSummarizeStep()).findByText("Count"),
      ).toBeInTheDocument();

      await changeCountToSumOfTotal();
      await userEvent.click(
        within(screen.getByTestId("metric-header")).getByRole("tab", {
          name: "About",
        }),
      );
      const leaveModal = within(await screen.findByRole("dialog"));
      expect(leaveModal.getByText("Discard your changes?")).toBeInTheDocument();
      await userEvent.click(leaveModal.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(router?.location.pathname).toBe(
        `/data-studio/library/metrics/${CARD_ID}/query`,
      );
      expect(screen.getByTestId("metric-query-editor")).toBeInTheDocument();
      expect(
        within(await getSummarizeStep()).getByText("Sum of Total"),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls("card-put")).toHaveLength(0);
    });

    it("links to the metrics explorer, and saves the caching strategy and shows it when reopened", async () => {
      setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
        // Another card's config, which the caching form must not show
        cacheConfigs: [
          createMockCacheConfigWithDoNotCacheStrategy({
            model: "question",
            model_id: 7,
          }),
        ],
      });

      const aboutPage = within(await screen.findByTestId("metric-about-page"));
      expect(aboutPage.getByDisplayValue("Orders count")).toBeInTheDocument();
      expect(await screen.findByTestId("explore-link")).toHaveAttribute(
        "href",
        `/explore?metricId=${CARD_ID}`,
      );

      const menu = await openMoreMenu();
      await userEvent.click(within(menu).getByText("Caching"));
      const modal = within(
        await screen.findByRole("dialog", { name: "Caching" }),
      );
      const strategySelect = await modal.findByTestId("cache-strategy-select");
      expect(strategySelect).toHaveValue("Default");
      await userEvent.click(strategySelect);
      await userEvent.click(
        await screen.findByRole("option", { name: /Duration/ }),
      );
      const durationInput = await modal.findByRole("spinbutton", {
        name: /Cache duration/,
      });
      await userEvent.clear(durationInput);
      await userEvent.type(durationInput, "24");
      await userEvent.click(modal.getByTestId("strategy-form-submit-button"));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/cache", { method: "PUT" }),
        ).toHaveLength(1);
      });
      const putCall = fetchMock.callHistory.lastCall("path:/api/cache", {
        method: "PUT",
      });
      const putBody: unknown = JSON.parse(String(putCall?.options.body));
      expect(putBody).toEqual({
        model: "question",
        model_id: CARD_ID,
        strategy: expect.objectContaining({
          type: "duration",
          duration: 24,
          unit: "hours",
        }),
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      await userEvent.click(within(await openMoreMenu()).getByText("Caching"));
      const reopenedModal = within(
        await screen.findByRole("dialog", { name: "Caching" }),
      );
      const reopenedStrategySelect = await reopenedModal.findByTestId(
        "cache-strategy-select",
      );
      await waitFor(() => {
        expect(reopenedStrategySelect).toHaveValue("Duration");
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("duplicates a metric into another collection and opens the copy", async () => {
      setupPickerEndpoints();
      const { router } = setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
      });

      await screen.findByTestId("metric-about-page");
      await userEvent.click(
        within(await openMoreMenu()).getByText("Duplicate"),
      );

      const modal = within(
        await screen.findByRole("dialog", {
          name: 'Duplicate "Orders count"',
        }),
      );
      expect(modal.getByLabelText("Name")).toHaveValue(
        "Orders count - Duplicate",
      );
      await userEvent.click(
        await modal.findByTestId("dashboard-and-collection-picker-button"),
      );
      const picker = within(await screen.findByTestId("entity-picker-modal"));
      await userEvent.click(await picker.findByText("Our analytics"));
      await userEvent.click(await picker.findByText(FIRST_COLLECTION.name));
      const selectButton = picker.getByRole("button", {
        name: "Select this collection",
      });
      await waitFor(() => expect(selectButton).toBeEnabled());
      await userEvent.click(selectButton);
      await userEvent.click(
        await modal.findByRole("button", { name: "Duplicate" }),
      );

      expect(await getRequestBody("card-create")).toMatchObject({
        name: "Orders count - Duplicate",
        collection_id: FIRST_COLLECTION.id,
        type: "metric",
        dataset_query: {
          stages: [
            {
              "source-table": ORDERS_ID,
              aggregation: [["count", expect.any(Object)]],
            },
          ],
        },
      });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      await waitFor(() => {
        expect(router?.location.pathname).toBe(
          `/data-studio/library/metrics/${NEW_CARD_ID}`,
        );
      });
      const aboutPage = within(await screen.findByTestId("metric-about-page"));
      // breadcrumbs + header
      await waitFor(() => {
        expect(aboutPage.getAllByText("Orders count - Duplicate")).toHaveLength(
          2,
        );
      });
    });

    it("moves a metric to another collection", async () => {
      setupPickerEndpoints();
      setup({
        initialRoute: `/data-studio/library/metrics/${CARD_ID}`,
        collection: LIBRARY_METRICS_COLLECTION,
      });

      await screen.findByTestId("metric-about-page");
      await userEvent.click(within(await openMoreMenu()).getByText("Move"));

      const picker = within(await screen.findByTestId("entity-picker-modal"));
      await userEvent.click(await picker.findByText("Our analytics"));
      await userEvent.click(await picker.findByText(FIRST_COLLECTION.name));
      const moveButton = picker.getByRole("button", { name: "Move" });
      await waitFor(() => expect(moveButton).toBeEnabled());
      await userEvent.click(moveButton);

      expect(await getRequestBody("card-put")).toEqual({
        collection_id: FIRST_COLLECTION.id,
        dashboard_id: null,
      });
      expect(
        new URL(String(fetchMock.callHistory.lastCall("card-put")?.url))
          .pathname,
      ).toBe(`/api/card/${CARD_ID}`);
      expect(
        await within(await screen.findByTestId("move-card-toast")).findByText(
          FIRST_COLLECTION.name,
        ),
      ).toBeInTheDocument();
    });
  });
});
