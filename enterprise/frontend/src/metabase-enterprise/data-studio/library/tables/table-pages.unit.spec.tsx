import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabaseEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupTablePublishingInfoEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  fireEvent,
  mockGetBoundingClientRect,
  renderRoutes,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { Outlet, Route, toRouteObjects } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Table, TableId } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockDataset,
  createMockDatasetData,
  createMockDependencyGraph,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersSubtotalField,
  createOrdersTable,
  createOrdersTotalField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getDataStudioTableRoutes } from "./routes";

/**
 * The published table pages of the Data Studio library, rendered through the
 * real table routes with a pro-self-hosted token, like the e2e specs these
 * tests replace. The table backend keeps its state: a PUT /api/table/:id
 * changes the table that later GET requests return.
 */

jest.mock(
  "metabase/common/data-studio/components/OverviewVisualization",
  () => ({
    // The query results are covered by the kept e2e test of the overview page
    OverviewVisualization: () => <div data-testid="overview-visualization" />,
  }),
);

registerVisualizations();

const LIBRARY_COLLECTION = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});

const DATA_COLLECTION = createMockCollection({
  id: 2,
  name: "Data",
  type: "library-data",
  location: "/1/",
  effective_ancestors: [LIBRARY_COLLECTION],
});

const ORDERS_DESCRIPTION =
  "Confirmed Sample Company orders for a product, from a user.";

// The e2e tests ran with a pro-self-hosted token, which has every feature
const ALL_TOKEN_FEATURES = Object.fromEntries(
  Object.keys(createMockTokenFeatures()).map((feature) => [feature, true]),
);

const TABLE_NODE = createMockTableDependencyNode({
  id: ORDERS_ID,
  data: createMockTableDependencyNodeData({
    name: "orders",
    display_name: "Orders",
    db_id: SAMPLE_DB_ID,
  }),
  dependents_count: { question: 1 },
});

const QUESTION_NODE = createMockCardDependencyNode({
  id: 42,
  data: createMockCardDependencyNodeData({
    name: "Test question",
    type: "question",
    display: "table",
  }),
});

function createTable(): Table {
  return createOrdersTable({
    collection: DATA_COLLECTION,
    description: ORDERS_DESCRIPTION,
    data_source: "ingested",
    owner_email: null,
    owner_user_id: null,
    db: createSampleDatabase({ tables: [] }),
    fields: [
      createOrdersIdField(),
      createOrdersSubtotalField(),
      createOrdersTotalField(),
      createOrdersDiscountField(),
    ],
  });
}

function setupTableBackend() {
  let table = createTable();
  fetchMock.get(`path:/api/table/${ORDERS_ID}/query_metadata`, () => table);
  fetchMock.get(`path:/api/table/${ORDERS_ID}`, () => table);
  fetchMock.put(`path:/api/table/${ORDERS_ID}`, (call) => {
    table = { ...table, ...JSON.parse(String(call.options.body)) };
    return table;
  });
}

function setupGraphEndpoints() {
  fetchMock.get("path:/api/ee/dependencies/graph", (call) => {
    const params = new URL(call.url).searchParams;
    const isTable =
      params.get("id") === String(ORDERS_ID) && params.get("type") === "table";
    return isTable
      ? createMockDependencyGraph({ nodes: [TABLE_NODE], edges: [] })
      : { status: 404 };
  });
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", (call) => {
    const params = new URL(call.url).searchParams;
    const isTableQuestions =
      params.get("id") === String(ORDERS_ID) &&
      params.get("type") === "table" &&
      params.getAll("dependent-types").includes("card") &&
      params.getAll("dependent-card-types").includes("question");
    return isTableQuestions ? [QUESTION_NODE] : [];
  });
}

function setup(initialRoute: string) {
  mockGetBoundingClientRect();
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(ALL_TOKEN_FEATURES),
  });
  setupEnterprisePlugins();
  setupTableBackend();
  setupGraphEndpoints();
  setupCollectionByIdEndpoint({
    collections: [LIBRARY_COLLECTION, DATA_COLLECTION],
  });
  setupUsersEndpoints([createMockUserListResult()]);
  setupDatabaseEndpoints(createSampleDatabase({ tables: [] }));
  setupTablePublishingInfoEndpoint(ORDERS_ID, null);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  fetchMock.post(
    "path:/api/dataset",
    createMockDataset({ data: createMockDatasetData({ rows: [] }) }),
  );

  const IsAdmin = () => <Outlet />;
  return renderRoutes(
    toRouteObjects(
      <Route
        element={
          <>
            <Outlet />
            <UndoListing />
          </>
        }
      >
        <Route path="data-studio/library">
          {getDataStudioTableRoutes(IsAdmin)}
        </Route>
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

function getTablePutBodies() {
  return fetchMock.callHistory
    .calls(`path:/api/table/${ORDERS_ID}`, { method: "PUT" })
    .map((call) => JSON.parse(String(call.options.body)));
}

const overviewUrl = (tableId: TableId) =>
  `/data-studio/library/tables/${tableId}`;

describe("published table pages", () => {
  describe("overview", () => {
    it("shows the breadcrumbs and the table properties", async () => {
      setup(overviewUrl(ORDERS_ID));

      const breadcrumbs = within(
        await screen.findByTestId("data-studio-breadcrumbs"),
      );
      expect(
        await breadcrumbs.findByRole("link", { name: "Semantic layer" }),
      ).toHaveAttribute("href", Urls.dataStudioLibrary({ expandedIds: [] }));
      expect(breadcrumbs.getByRole("link", { name: "Data" })).toHaveAttribute(
        "href",
        Urls.dataStudioLibrary({ expandedIds: [DATA_COLLECTION.id] }),
      );
      expect(breadcrumbs.getByText("Orders")).toBeInTheDocument();

      const sidebar = within(screen.getByTestId("table-description-sidebar"));
      expect(sidebar.getByText("Entity type")).toBeInTheDocument();
      expect(sidebar.getByText("Last edited at")).toBeInTheDocument();
      expect(sidebar.getByText("Database")).toBeInTheDocument();
      expect(sidebar.getByText("Sample Database")).toBeInTheDocument();
      expect(sidebar.getByText("Source")).toBeInTheDocument();
      expect(sidebar.getByPlaceholderText("Select a data source")).toHaveValue(
        "Ingested",
      );
      expect(sidebar.getByText("Owner")).toBeInTheDocument();
      expect(
        sidebar.getByPlaceholderText("Pick someone, or type an email"),
      ).toHaveValue("No owner");
      expect(sidebar.getByText("Fields")).toBeInTheDocument();
      expect(await sidebar.findByText("Dependents")).toBeInTheDocument();
    });

    it("updates the table description", async () => {
      setup(overviewUrl(ORDERS_ID));

      const section = within(
        await screen.findByTestId("table-description-section"),
      );
      expect(section.getByTestId("editable-text")).toHaveTextContent(
        "orders for a product",
      );
      await userEvent.click(section.getByTestId("editable-text"));
      const input = section.getByPlaceholderText("No description");
      await userEvent.clear(input);
      await userEvent.type(input, "Description changed");
      fireEvent.blur(input);

      expect(
        await screen.findByText("Table description updated"),
      ).toBeInTheDocument();
      expect(getTablePutBodies()).toEqual([
        { description: "Description changed" },
      ]);
    });

    it("updates the table name", async () => {
      setup(overviewUrl(ORDERS_ID));

      const input = await screen.findByTestId("table-name-input");
      expect(input).toHaveValue("Orders");
      await userEvent.clear(input);
      await userEvent.type(input, "Orders changed");
      fireEvent.blur(input);

      expect(await screen.findByText("Table name updated")).toBeInTheDocument();
      expect(getTablePutBodies()).toEqual([{ display_name: "Orders changed" }]);
      expect(await screen.findByTestId("table-name-input")).toHaveValue(
        "Orders changed",
      );
    });
  });

  describe("fields", () => {
    it("closes the field details and the preview, and keeps the preview closed for the next field", async () => {
      setup(`${overviewUrl(ORDERS_ID)}/fields`);

      const tableSection = within(await screen.findByTestId("table-section"));
      await userEvent.click(
        within(
          await tableSection.findByRole("listitem", { name: "Total" }),
        ).getByRole("img"),
      );
      const fieldSection = await screen.findByTestId("field-section");
      expect(
        within(fieldSection).getByPlaceholderText("Give this field a name"),
      ).toHaveValue("Total");
      await userEvent.click(
        within(fieldSection).getByRole("button", { name: /Preview/ }),
      );
      expect(await screen.findByTestId("preview-section")).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("field-section-header")).getByRole("link", {
          name: /close/i,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("field-section")).not.toBeInTheDocument(),
      );
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();

      await userEvent.click(
        within(
          tableSection.getByRole("listitem", { name: "Discount" }),
        ).getByRole("img"),
      );
      expect(
        within(await screen.findByTestId("field-section")).getByPlaceholderText(
          "Give this field a name",
        ),
      ).toHaveValue("Discount");
      expect(screen.queryByTestId("preview-section")).not.toBeInTheDocument();
    });
  });

  describe("dependencies", () => {
    it("shows the dependency graph of the table and its dependent questions", async () => {
      setup(`${overviewUrl(ORDERS_ID)}/dependencies`);

      const graph = within(await screen.findByTestId("dependency-graph"));
      const tableNode = await waitFor(() => {
        const node = graph
          .getAllByTestId("graph-node")
          .find((node) => node.getAttribute("aria-label") === "Orders");
        if (node == null) {
          throw new Error("No graph node for the Orders table");
        }
        return node;
      });
      // xyflow's drag handler on nodes needs a pointer event `view`, which
      // user-event does not provide in jsdom
      fireEvent.click(within(tableNode).getByText(/question/));

      const panel = within(await screen.findByTestId("graph-dependency-panel"));
      expect(await panel.findByText("Test question")).toBeInTheDocument();
    });
  });
});
