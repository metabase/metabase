import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupMetricDatasetEndpoint,
  setupMetricEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { setupAuditInfoEndpoint } from "__support__/server-mocks/audit";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupCustomVizPluginListEndpoint } from "__support__/server-mocks/custom-viz-plugin";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderRoutes, screen, waitFor, within } from "__support__/ui";
import { getMetricRoutes } from "metabase/metrics/routes";
import { Route, toRouteObjects } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDataset,
  createMockDatasetData,
  createMockDependencyGraph,
  createMockField,
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
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getDataStudioMetricRoutes } from "./routes";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;
const QUESTION_OVERVIEW_DASHBOARD_ID = 201;

const LIBRARY_METRICS_COLLECTION = createMockCollection({
  id: 10,
  name: "Metrics",
  type: "library-metrics",
});

// The e2e tests ran with a pro-self-hosted token, which has every feature
const ALL_TOKEN_FEATURES = Object.fromEntries(
  Object.keys(createMockTokenFeatures()).map((feature) => [feature, true]),
);

type SetupOpts = {
  initialRoute: string;
  collection?: Collection;
};

function setup({
  initialRoute,
  collection = createMockCollection(),
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
      createMockField({ name: "count", base_type: "type/Integer" }),
    ],
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  });
  const scalarDataset = createMockDataset({
    data: createMockDatasetData({
      cols: [createMockNumericColumn({ name: "count" })],
      rows: [[18760]],
    }),
  });
  const queryMetadata = createMockCardQueryMetadata({ databases: [SAMPLE_DB] });

  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(card, queryMetadata);
  setupAdhocQueryMetadataEndpoint(queryMetadata);
  setupCardQueryEndpoints(card, scalarDataset);
  setupMetricEndpoint(createMockMetric({ id: CARD_ID, name: card.name }));
  setupMetricDatasetEndpoint(scalarDataset);
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: CARD_ID }, []);
  setupPerformanceEndpoints([]);
  setupAuditInfoEndpoint({
    auditInfo: { question_overview: QUESTION_OVERVIEW_DASHBOARD_ID },
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupGraphEndpoint();
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
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
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

function setupGraphEndpoint() {
  fetchMock.get("path:/api/ee/dependencies/graph", (call) => {
    const params = new URL(call.url).searchParams;
    const isMetric =
      params.get("id") === String(CARD_ID) && params.get("type") === "card";
    return isMetric
      ? createMockDependencyGraph({
          nodes: [METRIC_NODE, ORDERS_TABLE_NODE],
          edges: [
            {
              from_entity_id: CARD_ID,
              from_entity_type: "card",
              to_entity_id: ORDERS_ID,
              to_entity_type: "table",
            },
          ],
        })
      : { status: 404 };
  });
}

async function openMoreMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "More options" }),
  );
  return screen.findByRole("menu");
}

describe("metric pages (EE)", () => {
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
      within(screen.getByTestId("metric-header")).getByRole("link", {
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
      within(screen.getByTestId("metric-header")).getByRole("link", {
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
});
