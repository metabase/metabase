import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardDataset,
  setupDatabasesEndpoints,
  setupDependencyGraphEndpoint,
  setupLibraryEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  createMockDOMRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import {
  findToast as findToastByMessage,
  selectOption,
} from "metabase/metadata/pages/shared/tests/helpers";
import { Outlet, Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Database,
  EnterpriseSettings,
  Table,
  TableId,
  UserListResult,
} from "metabase-types/api";
import {
  createMockBulkTableInfo,
  createMockBulkTableSelectionInfo,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockField,
  createMockPublishTablesResponse,
  createMockTable,
  createMockTokenFeatures,
  createMockTransform,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtField,
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersTable,
  createOrdersTaxField,
  createOrdersTotalField,
  createOrdersUserIdField,
  createPeopleIdField,
  createPeopleTable,
  createProductsIdField,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

// The search debounce is idle time in these tests: they assert what a search
// returns, not that the input waits before it asks.
jest.mock("metabase/utils/constants", () => ({
  ...jest.requireActual("metabase/utils/constants"),
  SEARCH_DEBOUNCE_DURATION: 0,
}));

registerVisualizations();

const BASE_PATH = "/data-studio/data";
const SAMPLE_DB_SCHEMA_ID = `${SAMPLE_DB_ID}:PUBLIC`;
const MISSING_ID = 12345;

const ORDERS_TABLE = createOrdersTable({
  description: "Confirmed Sample Company orders for a product, from a user.",
  fields: [
    createOrdersIdField({ database_type: "BIGINT" }),
    createOrdersUserIdField({ database_type: "INTEGER" }),
    createOrdersTaxField({ database_type: "DOUBLE PRECISION" }),
    createOrdersTotalField({ database_type: "DOUBLE PRECISION" }),
    createOrdersDiscountField({ database_type: "DOUBLE PRECISION" }),
    createOrdersCreatedAtField({ database_type: "TIMESTAMP" }),
  ],
});
const PEOPLE_TABLE = createPeopleTable({ fields: [createPeopleIdField()] });
const PRODUCTS_TABLE = createProductsTable({
  fields: [createProductsIdField()],
});
const REVIEWS_TABLE = createReviewsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PEOPLE_TABLE, PRODUCTS_TABLE, REVIEWS_TABLE],
});

const MYSQL_DB_ID = 2;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;
const createMysqlTable = (opts: Partial<Table>) =>
  createMockTable({ db_id: MYSQL_DB_ID, schema: "", ...opts });
const MYSQL_ORDERS_TABLE = createMysqlTable({
  id: 101,
  name: "orders",
  display_name: "Orders",
});
const MYSQL_PEOPLE_TABLE = createMysqlTable({
  id: 102,
  name: "people",
  display_name: "People",
});
const MYSQL_PRODUCTS_TABLE = createMysqlTable({
  id: 103,
  name: "products",
  display_name: "Products",
});
const MYSQL_REVIEWS_TABLE = createMysqlTable({
  id: 104,
  name: "reviews",
  display_name: "Reviews",
});
const MYSQL_DB = createMockDatabase({
  id: MYSQL_DB_ID,
  name: "QA MySQL8",
  engine: "mysql",
  tables: [
    MYSQL_ORDERS_TABLE,
    MYSQL_PEOPLE_TABLE,
    MYSQL_PRODUCTS_TABLE,
    MYSQL_REVIEWS_TABLE,
  ],
});

const WRITABLE_DB_ID = 3;
const DOMESTIC_ANIMALS_TABLE = createMockTable({
  id: 201,
  db_id: WRITABLE_DB_ID,
  schema: "Domestic",
  name: "Animals",
  display_name: "Animals",
});
const WILD_ANIMALS_TABLE = createMockTable({
  id: 202,
  db_id: WRITABLE_DB_ID,
  schema: "Wild",
  name: "Animals",
  display_name: "Animals",
});
const WILD_BIRDS_TABLE = createMockTable({
  id: 203,
  db_id: WRITABLE_DB_ID,
  schema: "Wild",
  name: "Birds",
  display_name: "Birds",
});
const WRITABLE_DB = createMockDatabase({
  id: WRITABLE_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [DOMESTIC_ANIMALS_TABLE, WILD_ANIMALS_TABLE, WILD_BIRDS_TABLE],
});

interface SetupOpts {
  databases?: Database[];
  initialRoute?: string;
  editableTable?: Table;
  searchResults?: { term: string; tables: Table[] };
  users?: UserListResult[];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
}

function setup({
  databases = [SAMPLE_DB],
  initialRoute = BASE_PATH,
  editableTable,
  searchResults,
  users = [createMockUserListResult()],
  remoteSyncType,
}: SetupOpts = {}) {
  // Registered first so that they answer before the static table routes.
  const updates = editableTable ? setupEditableTable(editableTable) : [];
  if (searchResults) {
    setupTableSearch(searchResults);
  }

  setupDatabasesEndpoints(databases);
  setupCardDataset();
  setupTablesBulkEndpoints();
  setupUsersEndpoints(users);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: false,
  });
  setupLibraryEndpoints();
  setupDependencyGraphEndpoint({ nodes: [], edges: [] });
  fetchMock.get(`path:/api/database/${MISSING_ID}`, 404);
  fetchMock.get(`path:/api/database/${MISSING_ID}/schemas`, 404);
  fetchMock.get(`path:/api/table/${MISSING_ID}/query_metadata`, {
    status: 404,
    body: "Not found.",
  });

  // The plugins read the token features when they initialize, so the
  // settings have to be in place first.
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncType != null,
      "remote-sync-type": remoteSyncType,
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
        dependencies: true,
        library: true,
        remote_sync: remoteSyncType != null,
        "schema-viewer": true,
      }),
    }),
  });
  setupEnterprisePlugins();

  const { router } = renderWithProviders(
    <>
      <Route path="data-studio/data">
        {getDataStudioMetadataRoutes(Outlet)}
      </Route>
      <Route path="admin/databases/create" element={<h1>Add a database</h1>} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return { getPathname: () => router?.location.pathname, updates };
}

/**
 * Serves the table metadata from a value that only the PUT handler changes,
 * the way the backend stores an update.
 */
function setupEditableTable(table: Table) {
  let current = table;
  const updates: unknown[] = [];

  fetchMock.get(`path:/api/table/${table.id}/query_metadata`, () => current);
  fetchMock.put(`path:/api/table/${table.id}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    updates.push(body);
    current = applyTableUpdate(current, body);
    return current;
  });

  return updates;
}

function applyTableUpdate(table: Table, body: unknown): Table {
  if (typeof body !== "object" || body == null) {
    return table;
  }
  const next = { ...table };
  if ("display_name" in body && typeof body.display_name === "string") {
    next.display_name = body.display_name;
  }
  if ("description" in body && typeof body.description === "string") {
    next.description = body.description;
  }
  return next;
}

function setupTableSearch({ term, tables }: { term: string; tables: Table[] }) {
  fetchMock.get("path:/api/table", (call) => {
    const params = new URL(call.url).searchParams;
    return params.get("term") === term ? tables : [];
  });
}

describe("DataModel (data studio, enterprise)", () => {
  beforeEach(() => {
    // The tree is a virtual list that measures its rows: short rows in a tall
    // container render every row of these small trees.
    jest
      .spyOn(window.Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const isRow = this.hasAttribute("data-index");
        return createMockDOMRect({ height: isRow ? 44 : 1000, width: 1000 });
      });
  });

  afterEach(async () => {
    await waitForRequestsToSettle();
    jest.restoreAllMocks();
  });

  describe("data loading", () => {
    it("should show 404 if database does not exist (metabase#14652)", async () => {
      const { getPathname } = setup({
        initialRoute: `${BASE_PATH}/database/${MISSING_ID}`,
      });

      expect(
        await within(await screen.findByTestId("data-model")).findByText(
          "Not found.",
        ),
      ).toBeInTheDocument();
      expect(await findTreeItems("database")).toHaveLength(1);
      expect(queryTreeItems("table")).toHaveLength(0);
      expect(getPathname()).toBe(`${BASE_PATH}/database/${MISSING_ID}`);
    });

    it("should show 404 if table does not exist", async () => {
      const path = `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${MISSING_ID}`;
      const { getPathname } = setup({ initialRoute: path });

      expect(
        await within(await screen.findByTestId("data-model")).findByText(
          "Not found.",
        ),
      ).toBeInTheDocument();
      expect(await findTreeItems("table")).toHaveLength(4);
      expect(queryTreeItems("database")).toHaveLength(1);
      expect(getPathname()).toBe(path);
    });

    it("should show 404 if field does not exist", async () => {
      const path = `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${MISSING_ID}`;
      const { getPathname } = setup({ initialRoute: path });

      expect(await findTreeItems("table")).toHaveLength(4);
      expect(queryTreeItems("database")).toHaveLength(1);
      const fieldSection = await screen.findByTestId("field-section-header");
      expect(fieldSection).toHaveTextContent("Field details");
      expect(
        await within(await screen.findByTestId("data-model")).findByText(
          "Not found.",
        ),
      ).toBeInTheDocument();
      expect(getPathname()).toBe(path);
    });

    it("should not show 404 error if database is not selected", async () => {
      setup({ databases: [SAMPLE_DB, WRITABLE_DB] });

      expect(await findTreeItems("database")).toHaveLength(2);
      expect(queryNotFound()).not.toBeInTheDocument();

      await userEvent.click(await findTreeItem("database", WRITABLE_DB.name));
      expect(await findTreeItems("schema")).toHaveLength(2);
      expect(queryNotFound()).not.toBeInTheDocument();

      await userEvent.click(await findTreeItem("schema", "Domestic"));
      expect(await findTreeItems("table")).toHaveLength(1);
      expect(queryNotFound()).not.toBeInTheDocument();

      await userEvent.click(await findTreeItem("table", "Animals"));
      expect(await findTableNameInput()).toHaveValue("Animals");
      expect(queryNotFound()).not.toBeInTheDocument();
    });
  });

  describe("table picker", () => {
    it("should show an empty state when there are no databases", async () => {
      const { getPathname } = setup({ databases: [] });

      expect(
        await screen.findByText("No connected databases"),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Connect a database" });
      expect(link).toHaveAttribute("href", "/admin/databases/create");

      await userEvent.click(link);
      expect(
        await screen.findByRole("heading", { name: "Add a database" }),
      ).toBeInTheDocument();
      expect(getPathname()).toBe("/admin/databases/create");
    });

    it("should allow to navigate tables in a database without schemas", async () => {
      const { getPathname } = setup({ databases: [SAMPLE_DB, MYSQL_DB] });

      await userEvent.click(await findTreeItem("database", MYSQL_DB.name));
      expect(await findTreeItems("table")).toHaveLength(4);
      expect(queryTreeItems("schema")).toHaveLength(0);
      await waitFor(() =>
        expect(getPathname()).toBe(
          `${BASE_PATH}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
        ),
      );

      await userEvent.click(await findTreeItem("table", "Products"));
      expect(await findTableNameInput()).toHaveValue("Products");
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/${MYSQL_PRODUCTS_TABLE.id}`,
      );
    });

    it("should allow searching for tables", async () => {
      const { getPathname } = setup({
        databases: [SAMPLE_DB, MYSQL_DB],
        searchResults: {
          term: "rEvIeWs",
          tables: [
            { ...REVIEWS_TABLE, db: SAMPLE_DB },
            { ...MYSQL_REVIEWS_TABLE, db: MYSQL_DB },
          ],
        },
      });

      await findTreeItems("database");
      await userEvent.type(
        screen.getByPlaceholderText("Search tables"),
        "rEvIeWs",
      );

      await waitFor(() => expect(queryTreeItems("table")).toHaveLength(2));
      expect(queryTreeItems("database")).toHaveLength(2);
      expect(
        await findTreeItem("database", SAMPLE_DB.name),
      ).toBeInTheDocument();
      expect(await findTreeItem("database", MYSQL_DB.name)).toBeInTheDocument();

      await userEvent.click(await findTableTreeItem(MYSQL_REVIEWS_TABLE.id));
      expect(await findTableNameInput()).toHaveValue("Reviews");
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/${MYSQL_REVIEWS_TABLE.id}`,
      );
    });

    it("should restore previously selected table when expanding the tree", async () => {
      const path = `${BASE_PATH}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`;
      const { getPathname } = setup({
        databases: [SAMPLE_DB, MYSQL_DB],
        initialRoute: path,
      });

      expect(await findTreeItems("table")).toHaveLength(4);
      await userEvent.click(await findTreeItem("database", MYSQL_DB.name));
      await waitFor(() => expect(getPathname()).toBe(path));

      await userEvent.click(await findTreeItem("database", MYSQL_DB.name));
      await waitFor(() => expect(getPathname()).toBe(path));
      expect(await findTreeItems("table")).toHaveLength(4);

      // ensure navigation to another db works
      await userEvent.click(await findTreeItem("database", SAMPLE_DB.name));
      await waitFor(() => expect(queryTreeItems("table")).toHaveLength(8));
    });

    it("should auto-open the only schema in the only database", async () => {
      const { getPathname } = setup();

      await waitFor(() =>
        expect(getPathname()).toBe(
          `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`,
        ),
      );
      expect(await findTreeItems("table")).toHaveLength(4);
      expect(queryTreeItems("database")).toHaveLength(1);
      expect(
        await findTreeItem("database", SAMPLE_DB.name),
      ).toBeInTheDocument();
      expect(queryTreeItems("schema")).toHaveLength(0);
      expect(screen.queryByTestId("table-section")).not.toBeInTheDocument();

      await userEvent.click(await findTreeItem("table", "Orders"));
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      );
      expect(await findTableNameInput()).toHaveValue("Orders");

      await userEvent.click(await findTreeItem("table", "Products"));
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PRODUCTS_ID}`,
      );
      expect(await screen.findByTestId("table-section")).toBeInTheDocument();
      expect(await findTableNameInput("Products")).toBeInTheDocument();
    });

    it("should allow to navigate databases, schemas, and tables", async () => {
      const { getPathname } = setup({ databases: [SAMPLE_DB, WRITABLE_DB] });

      expect(await findTreeItems("database")).toHaveLength(2);
      expect(getPathname()).toBe(BASE_PATH);
      expect(queryTreeItems("schema")).toHaveLength(0);
      expect(queryTreeItems("table")).toHaveLength(0);

      // open database
      await userEvent.click(await findTreeItem("database", WRITABLE_DB.name));
      expect(getPathname()).toBe(`${BASE_PATH}/database/${WRITABLE_DB_ID}`);
      expect(await findTreeItems("schema")).toHaveLength(2);
      expect(queryTreeItems("database")).toHaveLength(2);
      expect(queryTreeItems("table")).toHaveLength(0);
      expect(await findTreeItem("schema", "Wild")).toBeInTheDocument();

      // open schema
      await userEvent.click(await findTreeItem("schema", "Domestic"));
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
      );
      expect(await findTreeItems("table")).toHaveLength(1);
      expect(queryTreeItems("schema")).toHaveLength(2);

      // open table
      await userEvent.click(await findTreeItem("table", "Animals"));
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/${DOMESTIC_ANIMALS_TABLE.id}`,
      );
      expect(await findTableNameInput()).toHaveValue("Animals");

      // open another schema
      await userEvent.click(await findTreeItem("schema", "Wild"));
      await waitFor(() => expect(queryTreeItems("table")).toHaveLength(3));
      expect(queryTreeItems("schema")).toHaveLength(2);
      expect(queryTreeItems("database")).toHaveLength(2);

      // open another table
      await userEvent.click(await findTreeItem("table", "Birds"));
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/${WILD_BIRDS_TABLE.id}`,
      );
      expect(await findTableNameInput("Birds")).toBeInTheDocument();

      // close schema
      await userEvent.click(
        within(await findTreeItem("schema", "Wild")).getByRole("button", {
          name: "Collapse",
        }),
      );
      await waitFor(() => expect(queryTreeItems("table")).toHaveLength(1));
      expect(queryTreeItems("schema")).toHaveLength(2);
      expect(queryTreeItem("table", "Birds")).toBeUndefined();

      // close database
      await userEvent.click(
        within(await findTreeItem("database", WRITABLE_DB.name)).getByRole(
          "button",
          { name: "Collapse" },
        ),
      );
      await waitFor(() => expect(queryTreeItems("schema")).toHaveLength(0));
      expect(queryTreeItems("table")).toHaveLength(0);
      expect(queryTreeItems("database")).toHaveLength(2);

      // we still have a table opened
      expect(getPathname()).toBe(
        `${BASE_PATH}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/${WILD_BIRDS_TABLE.id}`,
      );
      expect(await findTableNameInput("Birds")).toBeInTheDocument();
    });
  });

  describe("table section", () => {
    it("should show field data types and semantic types", async () => {
      setup({
        initialRoute: `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      });

      expect(await findTreeItems("table")).toHaveLength(4);
      await userEvent.click(await screen.findByRole("tab", { name: /Fields/ }));

      await clickTableSectionField("ID");
      expect(await findFieldDataType("BIGINT")).toBeInTheDocument();
      expect(getSemanticTypeInput()).toHaveValue("Entity Key");

      await clickTableSectionField("User ID");
      expect(await findFieldDataType("INTEGER")).toBeInTheDocument();
      expect(getSemanticTypeInput()).toHaveValue("Foreign Key");
      await waitFor(() =>
        expect(
          within(getFieldSection()).getByLabelText("Foreign key target"),
        ).toHaveValue("People → ID"),
      );

      await clickTableSectionField("Tax");
      expect(await findFieldDataType("DOUBLE PRECISION")).toBeInTheDocument();
      expect(getSemanticTypeInput()).toHaveValue("No semantic type");

      await clickTableSectionField("Discount");
      expect(await findFieldDataType("DOUBLE PRECISION")).toBeInTheDocument();
      expect(getSemanticTypeInput()).toHaveValue("Discount");

      await clickTableSectionField("Created At");
      expect(await findFieldDataType("TIMESTAMP")).toBeInTheDocument();
      expect(getSemanticTypeInput()).toHaveValue("Creation timestamp");
    });

    it("should be able to see details of a table", async () => {
      setup({ initialRoute: `${BASE_PATH}/database/${SAMPLE_DB_ID}` });

      expect(await findTreeItems("table")).toHaveLength(4);
      expect(screen.queryByTestId("table-section")).not.toBeInTheDocument();

      await userEvent.click(await findTreeItem("table", "Orders"));
      expect(await findTableNameInput()).toHaveValue("Orders");
      expect(getTableDescriptionInput()).toHaveValue(
        "Confirmed Sample Company orders for a product, from a user.",
      );
      expect(screen.queryByTestId("field-section")).not.toBeInTheDocument();
    });

    it("should be able to update a table in a database without schemas", async () => {
      const { updates } = setup({
        databases: [SAMPLE_DB, MYSQL_DB],
        editableTable: MYSQL_ORDERS_TABLE,
        initialRoute: `${BASE_PATH}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/${MYSQL_ORDERS_TABLE.id}`,
      });

      const nameInput = await findTableNameInput();
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "New orders");
      await userEvent.tab();

      expect(await findToast()).toHaveTextContent("Table name updated");
      expect(updates).toEqual([{ display_name: "New orders" }]);
      expect(nameInput).toHaveValue("New orders");
      await expectStoredAfterReopen({
        tableId: MYSQL_ORDERS_TABLE.id,
        otherTableName: "Products",
        assert: async () =>
          expect(await findTableNameInput("New orders")).toBeInTheDocument(),
      });
    });

    it("should show empty state when table has no fields", async () => {
      const animalsWithoutFields = { ...DOMESTIC_ANIMALS_TABLE, fields: [] };
      const wildAnimals = {
        ...WILD_ANIMALS_TABLE,
        description: "Wild animals",
        fields: [createMockField({ id: 301, table_id: WILD_ANIMALS_TABLE.id })],
      };
      setup({
        databases: [
          SAMPLE_DB,
          {
            ...WRITABLE_DB,
            tables: [animalsWithoutFields, wildAnimals, WILD_BIRDS_TABLE],
          },
        ],
      });

      await userEvent.click(await findTreeItem("database", WRITABLE_DB.name));
      await userEvent.click(await findTreeItem("schema", "Domestic"));
      await userEvent.click(await findTreeItem("table", "Animals"));
      await userEvent.click(await screen.findByRole("tab", { name: /Fields/ }));

      expect(
        await findInTableSection((section) =>
          within(section).getByText("This table has no fields"),
        ),
      ).toBeInTheDocument();
      expect(
        within(getTableSection()).queryByRole("button", { name: /Sorting/ }),
      ).not.toBeInTheDocument();

      // positive control: a table with fields can be sorted
      await userEvent.click(await findTreeItem("schema", "Wild"));
      await userEvent.click(await findTableTreeItem(WILD_ANIMALS_TABLE.id));
      // the previous table stays on screen until the new metadata arrives
      await findInTableSection((section) =>
        within(section).getByDisplayValue("Wild animals"),
      );
      await userEvent.click(await screen.findByRole("tab", { name: /Fields/ }));
      expect(
        await findInTableSection((section) =>
          within(section).getByRole("button", { name: /Sorting/ }),
        ),
      ).toBeInTheDocument();
      expect(
        within(getTableSection()).queryByText("This table has no fields"),
      ).not.toBeInTheDocument();
    });

    it("should allow changing the table description", async () => {
      const { updates } = setup({
        editableTable: ORDERS_TABLE,
        initialRoute: `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      });

      await findTableNameInput();
      const descriptionInput = getTableDescriptionInput();
      await userEvent.clear(descriptionInput);
      await userEvent.type(descriptionInput, "New description");
      await userEvent.tab();

      expect(await findToast()).toHaveTextContent("Table description updated");
      expect(updates).toEqual([{ description: "New description" }]);
      expect(descriptionInput).toHaveValue("New description");
      await expectStoredAfterReopen({
        tableId: ORDERS_ID,
        otherTableName: "Products",
        assert: async () => {
          expect(await findTableNameInput("Orders")).toBeInTheDocument();
          expect(getTableDescriptionInput()).toHaveValue("New description");
        },
      });
    });

    it("should allow clearing the table description", async () => {
      const { updates } = setup({
        editableTable: ORDERS_TABLE,
        initialRoute: `${BASE_PATH}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      });

      await findTableNameInput();
      const descriptionInput = getTableDescriptionInput();
      await userEvent.clear(descriptionInput);
      await userEvent.tab();

      expect(await findToast()).toHaveTextContent("Table description updated");
      expect(updates).toEqual([{ description: "" }]);
      expect(descriptionInput).toHaveValue("");
      await expectStoredAfterReopen({
        tableId: ORDERS_ID,
        otherTableName: "Products",
        assert: async () => {
          expect(await findTableNameInput("Orders")).toBeInTheDocument();
          expect(getTableDescriptionInput()).toHaveValue("");
        },
      });
    });
  });
});

/**
 * Opens another table and comes back, so the table section mounts again from
 * the refetched metadata instead of its own input state.
 */
async function expectStoredAfterReopen({
  tableId,
  otherTableName,
  assert,
}: {
  tableId: TableId;
  otherTableName: string;
  assert: () => Promise<unknown>;
}) {
  await userEvent.click(await findTreeItem("table", otherTableName));
  expect(await findTableNameInput(otherTableName)).toBeInTheDocument();
  await userEvent.click(await findTableTreeItem(tableId));
  await assert();
}

function getDataModel() {
  return screen.getByTestId("data-model");
}

function queryNotFound() {
  return within(getDataModel()).queryByText(/Not found/);
}

/**
 * Runs the query against the current table section on every retry: switching
 * tables replaces the section once the new metadata arrives.
 */
async function findInTableSection(
  query: (section: HTMLElement) => HTMLElement,
) {
  return await waitFor(() => query(getTableSection()));
}

function getTableSection() {
  return screen.getByTestId("table-section");
}

function getFieldSection() {
  return screen.getByTestId("field-section");
}

async function findTableNameInput(value?: string) {
  return await findInTableSection((section) =>
    value != null
      ? within(section).getByDisplayValue(value)
      : within(section).getByPlaceholderText("Give this table a name"),
  );
}

function getTableDescriptionInput() {
  return within(getTableSection()).getByPlaceholderText(
    "Give this table a description",
  );
}

async function clickTableSectionField(name: string) {
  const field = await findInTableSection((section) =>
    within(section).getByRole("listitem", { name }),
  );
  await userEvent.click(within(field).getByRole("img"));
}

async function findFieldDataType(value: string) {
  return await waitFor(() => {
    const dataType = within(getFieldSection()).getByLabelText("Data type");
    // anchored: the data type must be the whole text, not a part of it
    expect(dataType).toHaveTextContent(new RegExp(`^${value}$`));
    return dataType;
  });
}

function getSemanticTypeInput() {
  return within(getFieldSection()).getByPlaceholderText(
    "Select a semantic type",
  );
}

async function findToast() {
  return await screen.findByTestId("toast-undo");
}

type TreeItemType = "database" | "schema" | "table";

function queryTreeItems(type: TreeItemType) {
  return screen
    .queryAllByTestId("tree-item")
    .filter(
      (item) =>
        item.getAttribute("data-type") === type &&
        within(item).queryByTestId("loading-placeholder") == null,
    );
}

function queryTreeItem(type: TreeItemType, name: string) {
  return queryTreeItems(type).find((item) => item.textContent?.includes(name));
}

async function findTreeItems(type: TreeItemType) {
  await waitFor(() => expect(queryTreeItems(type).length).toBeGreaterThan(0));
  return queryTreeItems(type);
}

async function findTreeItem(type: TreeItemType, name: string) {
  return await waitFor(() => {
    const items = queryTreeItems(type).filter((item) =>
      item.textContent?.includes(name),
    );
    expect(items).toHaveLength(1);
    return items[0];
  });
}

async function findTableTreeItem(tableId: TableId) {
  return await waitFor(() => {
    const item = queryTreeItems("table").find(
      (item) => item.getAttribute("data-table-id") === String(tableId),
    );
    return checkNotNull(item);
  });
}

const LIBRARY_ID = 6464;
const LIBRARY_DATA_COLLECTION = createMockCollectionItem({
  id: 10,
  name: "Data",
  model: "collection",
  type: "library-data",
  can_write: true,
  location: `/${LIBRARY_ID}/`,
  here: ["table", "collection"],
  below: ["table", "collection"],
});

const TESTY_USER = createMockUserListResult({ id: 1 });
const BOBBY_USER = createMockUserListResult({
  id: 2,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "bobby@metabase.test",
});
const USERS = [TESTY_USER, BOBBY_USER];

type TableEditBody = {
  table_ids?: TableId[];
  schema_ids?: string[];
  database_ids?: number[];
} & Partial<
  Pick<
    Table,
    | "owner_user_id"
    | "owner_email"
    | "data_layer"
    | "entity_type"
    | "data_source"
  >
>;

const TABLE_EDIT_ATTRIBUTES = [
  "owner_user_id",
  "owner_email",
  "data_layer",
  "entity_type",
  "data_source",
] as const;

/**
 * A table backend that keeps state. The table lists of the tree, the search,
 * the table metadata and the publishing info read the stored tables, and each
 * write changes them inside the handler of its own request, the way the
 * backend expands the database, schema and table selectors
 * (data_studio/api/table_test.clj `bulk-edit-test`).
 *
 * Register it before the generic mocks of `setup`: fetch-mock answers with the
 * first route that matches.
 */
function setupTablesBackend({
  databases,
  hasLibrary = true,
}: {
  databases: Database[];
  hasLibrary?: boolean;
}) {
  const tablesById = new Map<TableId, Table>(
    databases.flatMap((database) =>
      (database.tables ?? []).map((table): [TableId, Table] => [
        table.id,
        structuredClone({ ...table, db_id: database.id }),
      ]),
    ),
  );
  let isLibraryCreated = hasLibrary;

  const getTable = (id: TableId) => checkNotNull(tablesById.get(id));
  const resolveSelectors = ({
    table_ids = [],
    schema_ids = [],
    database_ids = [],
  }: TableEditBody) =>
    [...tablesById.values()].filter(
      (table) =>
        table_ids.includes(table.id) ||
        database_ids.includes(table.db_id) ||
        schema_ids.includes(`${table.db_id}:${table.schema}`),
    );

  databases.forEach((database) => {
    const schemaNames = _.uniq(
      (database.tables ?? []).map((table) => table.schema),
    );
    schemaNames.forEach((schema) => {
      fetchMock.get({
        url: `path:/api/database/${database.id}/schema/${encodeURIComponent(schema)}`,
        name: `stateful-database-${database.id}-schema-${schema}`,
        response: () =>
          [...tablesById.values()]
            .filter(
              (table) => table.db_id === database.id && table.schema === schema,
            )
            .map((table) => structuredClone(table)),
      });
    });
  });

  tablesById.forEach((table) => {
    fetchMock.get({
      url: `path:/api/table/${table.id}/query_metadata`,
      name: `stateful-table-${table.id}-query-metadata`,
      response: () => structuredClone(getTable(table.id)),
    });
    fetchMock.put({
      url: `path:/api/table/${table.id}`,
      name: `stateful-table-${table.id}-put`,
      response: (call) => {
        const storedTable = getTable(table.id);
        Object.assign(storedTable, getRequestBody(call));
        return structuredClone(storedTable);
      },
    });
  });

  fetchMock.get({
    url: "path:/api/table",
    name: "stateful-table-search",
    response: (call) => {
      const term = new URL(call.url).searchParams.get("term") ?? "";
      return [...tablesById.values()]
        .filter((table) =>
          [table.name, table.display_name].some((name) =>
            name.toLowerCase().startsWith(term.toLowerCase()),
          ),
        )
        .map((table) => structuredClone(table));
    },
  });

  fetchMock.post({
    url: "path:/api/data-studio/table/edit",
    name: "stateful-tables-edit",
    response: (call) => {
      const body: TableEditBody = getRequestBody(call);
      const attributes = _.pick(body, ...TABLE_EDIT_ATTRIBUTES);
      resolveSelectors(body).forEach((table) =>
        Object.assign(table, attributes),
      );
      return {};
    },
  });

  fetchMock.post({
    url: "path:/api/data-studio/table/selection",
    name: "stateful-tables-selection",
    response: (call) => {
      const tables = resolveSelectors(getRequestBody(call));
      const [table] = tables;
      return createMockBulkTableSelectionInfo({
        selected_table:
          tables.length === 1
            ? createMockBulkTableInfo({
                id: table.id,
                db_id: table.db_id,
                name: table.name,
                display_name: table.display_name,
                schema: table.schema,
                is_published: table.is_published,
              })
            : null,
      });
    },
  });

  fetchMock.post({
    url: "path:/api/ee/data-studio/table/publish-tables",
    name: "stateful-tables-publish",
    response: (call) => {
      resolveSelectors(getRequestBody(call)).forEach((table) => {
        table.is_published = true;
      });
      return createMockPublishTablesResponse({
        target_collection: createMockCollection({
          id: LIBRARY_DATA_COLLECTION.id,
          name: LIBRARY_DATA_COLLECTION.name,
        }),
      });
    },
  });

  fetchMock.post({
    url: "path:/api/ee/data-studio/table/unpublish-tables",
    name: "stateful-tables-unpublish",
    response: (call) => {
      resolveSelectors(getRequestBody(call)).forEach((table) => {
        table.is_published = false;
      });
      return { status: 204 };
    },
  });

  fetchMock.get({
    url: "path:/api/ee/library",
    name: "stateful-library",
    response: () =>
      isLibraryCreated
        ? createMockCollectionItem({
            id: LIBRARY_ID,
            name: "Library",
            type: "library",
            model: "collection",
            location: "/",
            here: ["collection"],
            below: ["table"],
          })
        : { message: "not found" },
  });
  fetchMock.post({
    url: "path:/api/ee/library",
    name: "stateful-library-create",
    response: () => {
      isLibraryCreated = true;
      return createMockCollection({ id: LIBRARY_ID, name: "Library" });
    },
  });
  fetchMock.get(`path:/api/collection/${LIBRARY_ID}/items`, {
    data: [LIBRARY_DATA_COLLECTION],
    total: 1,
  });
  fetchMock.get(
    `path:/api/collection/${LIBRARY_DATA_COLLECTION.id}`,
    createMockCollection({
      id: LIBRARY_DATA_COLLECTION.id,
      name: LIBRARY_DATA_COLLECTION.name,
      type: "library-data",
      location: `/${LIBRARY_ID}/`,
    }),
  );
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root", name: "Our analytics" }),
  );

  return {
    getTable: (id: TableId) => structuredClone(getTable(id)),
  };
}

function getRequestBody(call: CallLog) {
  return JSON.parse(String(call.options.body));
}

function getRequestBodies(routeName: string): unknown[] {
  return fetchMock.callHistory.calls(routeName).map(getRequestBody);
}

function getTableRow(tableId: TableId) {
  const row = queryTreeItems("table").find(
    (item) => item.getAttribute("data-table-id") === String(tableId),
  );
  return checkNotNull(row);
}

async function findTableRow(tableId: TableId) {
  return await waitFor(() => getTableRow(tableId));
}

async function toggleRowCheckbox(row: HTMLElement) {
  await userEvent.click(within(row).getByRole("checkbox"));
}

async function selectAttribute(placeholder: string, option: string) {
  await selectOption(screen.getByPlaceholderText(placeholder), option);
}

async function expectRowOwner(tableId: TableId, owner: string) {
  // anchored: the owner must be the whole cell text, as the e2e `have.text`
  // checked, so extra text in the cell fails
  const wholeText = new RegExp(
    `^${owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );
  await waitFor(() =>
    expect(
      within(getTableRow(tableId)).getByTestId("table-owner"),
    ).toHaveTextContent(wholeText),
  );
}

async function expectRowPublished(tableId: TableId) {
  await waitFor(() =>
    expect(
      within(getTableRow(tableId)).getByLabelText("Published"),
    ).toBeInTheDocument(),
  );
}

async function publishSelection(buttonLabel: string) {
  await userEvent.click(screen.getByRole("button", { name: /Publish$/ }));
  const modal = await screen.findByRole("dialog");
  await userEvent.click(
    await within(modal).findByRole("button", { name: buttonLabel }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

const BULK_SAMPLE_DB_ID = 11;
const BULK_ACCOUNTS_TABLE = createMockTable({
  id: 401,
  db_id: BULK_SAMPLE_DB_ID,
  schema: "PUBLIC",
  name: "ACCOUNTS",
  display_name: "Accounts",
});
const BULK_ORDERS_TABLE = createMockTable({
  id: 402,
  db_id: BULK_SAMPLE_DB_ID,
  schema: "PUBLIC",
  name: "ORDERS",
  display_name: "Orders",
});
const BULK_SAMPLE_DB = createMockDatabase({
  id: BULK_SAMPLE_DB_ID,
  name: "Sample Database",
  tables: [BULK_ACCOUNTS_TABLE, BULK_ORDERS_TABLE],
});

const BULK_WRITABLE_DB_ID = 12;
const BULK_DOMESTIC_ANIMALS_TABLE = createMockTable({
  id: 501,
  db_id: BULK_WRITABLE_DB_ID,
  schema: "Domestic",
  name: "Animals",
  display_name: "Animals",
});
const BULK_WILD_ANIMALS_TABLE = createMockTable({
  id: 502,
  db_id: BULK_WRITABLE_DB_ID,
  schema: "Wild",
  name: "Animals",
  display_name: "Animals",
});
const BULK_WRITABLE_DB = createMockDatabase({
  id: BULK_WRITABLE_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [BULK_DOMESTIC_ANIMALS_TABLE, BULK_WILD_ANIMALS_TABLE],
});

const SCHEMAS_DB_ID = 13;
const SCHEMA_A_TABLE = createMockTable({
  id: 601,
  db_id: SCHEMAS_DB_ID,
  schema: "Schema A",
  name: "Animals",
  display_name: "Animals A",
});
const SCHEMA_B_TABLE = createMockTable({
  id: 602,
  db_id: SCHEMAS_DB_ID,
  schema: "Schema B",
  name: "Animals",
  display_name: "Animals B",
});
const SCHEMA_C_TABLE = createMockTable({
  id: 603,
  db_id: SCHEMAS_DB_ID,
  schema: "Schema C",
  name: "Animals",
  display_name: "Animals C",
});
const SCHEMAS_DB = createMockDatabase({
  id: SCHEMAS_DB_ID,
  name: "Many schemas",
  engine: "postgres",
  tables: [SCHEMA_A_TABLE, SCHEMA_B_TABLE, SCHEMA_C_TABLE],
});

const NO_SELECTORS = { table_ids: [], schema_ids: [], database_ids: [] };

describe("DataModel (data studio, enterprise) > bulk table editing", () => {
  beforeEach(() => {
    jest
      .spyOn(window.Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const isRow = this.hasAttribute("data-index");
        return createMockDOMRect({ height: isRow ? 44 : 1000, width: 1000 });
      });
  });

  afterEach(async () => {
    await waitForRequestsToSettle();
    jest.restoreAllMocks();
  });

  it("should change the owner of and publish tables selected in two databases", async () => {
    const databases = [BULK_SAMPLE_DB, BULK_WRITABLE_DB];
    const backend = setupTablesBackend({ databases });
    setup({ databases, users: USERS });

    await userEvent.click(
      await findTreeItem("database", BULK_WRITABLE_DB.name),
    );
    await userEvent.click(await findTreeItem("schema", "Domestic"));
    await userEvent.click(await findTreeItem("database", BULK_SAMPLE_DB.name));
    await toggleRowCheckbox(await findTableRow(BULK_ACCOUNTS_TABLE.id));
    await toggleRowCheckbox(await findTableRow(BULK_DOMESTIC_ANIMALS_TABLE.id));
    expect(
      await screen.findByRole("heading", { name: /2 tables selected/ }),
    ).toBeInTheDocument();

    await selectAttribute("Pick someone, or type an email", "Bobby Tables");
    await waitFor(() =>
      expect(getRequestBodies("stateful-tables-edit")).toEqual([
        {
          ...NO_SELECTORS,
          table_ids: [BULK_ACCOUNTS_TABLE.id, BULK_DOMESTIC_ANIMALS_TABLE.id],
          owner_email: null,
          owner_user_id: BOBBY_USER.id,
        },
      ]),
    );
    await expectRowOwner(BULK_ACCOUNTS_TABLE.id, "Bobby Tables");
    await expectRowOwner(BULK_DOMESTIC_ANIMALS_TABLE.id, "Bobby Tables");
    expect(
      within(getTableRow(BULK_ORDERS_TABLE.id)).queryByTestId("table-owner"),
    ).not.toBeInTheDocument();

    await publishSelection("Publish these tables");
    expect(getRequestBodies("stateful-tables-publish")).toEqual([
      expect.objectContaining({
        ...NO_SELECTORS,
        table_ids: [BULK_ACCOUNTS_TABLE.id, BULK_DOMESTIC_ANIMALS_TABLE.id],
      }),
    ]);
    await expectRowPublished(BULK_ACCOUNTS_TABLE.id);
    await expectRowPublished(BULK_DOMESTIC_ANIMALS_TABLE.id);
    expect(
      within(getTableRow(BULK_ORDERS_TABLE.id)).queryByLabelText("Published"),
    ).not.toBeInTheDocument();
    expect(backend.getTable(BULK_ORDERS_TABLE.id).is_published).toBe(false);
  });

  it("should change the owner of and publish tables selected in search results", async () => {
    const databases = [BULK_SAMPLE_DB, BULK_WRITABLE_DB];
    setupTablesBackend({ databases });
    setup({ databases, users: USERS });

    await userEvent.type(
      await screen.findByPlaceholderText("Search tables"),
      "a",
    );
    await toggleRowCheckbox(await findTableRow(BULK_ACCOUNTS_TABLE.id));
    await toggleRowCheckbox(await findTableRow(BULK_WILD_ANIMALS_TABLE.id));
    expect(
      await screen.findByRole("heading", { name: /2 tables selected/ }),
    ).toBeInTheDocument();

    await selectAttribute("Pick someone, or type an email", "Bobby Tables");
    await waitFor(() =>
      expect(getRequestBodies("stateful-tables-edit")).toEqual([
        {
          ...NO_SELECTORS,
          table_ids: [BULK_ACCOUNTS_TABLE.id, BULK_WILD_ANIMALS_TABLE.id],
          owner_email: null,
          owner_user_id: BOBBY_USER.id,
        },
      ]),
    );
    await expectRowOwner(BULK_ACCOUNTS_TABLE.id, "Bobby Tables");
    await expectRowOwner(BULK_WILD_ANIMALS_TABLE.id, "Bobby Tables");
    expect(
      within(getTableRow(BULK_DOMESTIC_ANIMALS_TABLE.id)).queryByTestId(
        "table-owner",
      ),
    ).not.toBeInTheDocument();

    // the selection is kept after the edit, so it can be published at once
    await publishSelection("Publish these tables");
    expect(getRequestBodies("stateful-tables-publish")).toEqual([
      expect.objectContaining({
        ...NO_SELECTORS,
        table_ids: [BULK_ACCOUNTS_TABLE.id, BULK_WILD_ANIMALS_TABLE.id],
      }),
    ]);
    await expectRowPublished(BULK_ACCOUNTS_TABLE.id);
    await expectRowPublished(BULK_WILD_ANIMALS_TABLE.id);
    expect(
      within(getTableRow(BULK_DOMESTIC_ANIMALS_TABLE.id)).queryByLabelText(
        "Published",
      ),
    ).not.toBeInTheDocument();
  });

  it("should edit the attributes of and publish every table of a database", async () => {
    const databases = [BULK_SAMPLE_DB, BULK_WRITABLE_DB];
    setupTablesBackend({ databases });
    setup({ databases, users: USERS });

    await userEvent.click(
      await findTreeItem("database", BULK_WRITABLE_DB.name),
    );
    await userEvent.click(await findTreeItem("schema", "Domestic"));
    await userEvent.click(await findTreeItem("schema", "Wild"));
    await findTableRow(BULK_WILD_ANIMALS_TABLE.id);
    await toggleRowCheckbox(
      await findTreeItem("database", BULK_WRITABLE_DB.name),
    );
    // the rows of the database are loaded, so it selects each of its tables
    expect(
      await screen.findByRole("heading", { name: /2 tables selected/ }),
    ).toBeInTheDocument();

    await selectAttribute("Pick someone, or type an email", "Bobby Tables");
    await selectAttribute("Select visibility layer", "Final");
    await selectAttribute("Select entity type", "Person");
    await selectAttribute("Select a data source", "Ingested");

    const selectors = {
      ...NO_SELECTORS,
      table_ids: [BULK_DOMESTIC_ANIMALS_TABLE.id, BULK_WILD_ANIMALS_TABLE.id],
    };
    await waitFor(() =>
      expect(getRequestBodies("stateful-tables-edit")).toEqual([
        { ...selectors, owner_email: null, owner_user_id: BOBBY_USER.id },
        { ...selectors, data_layer: "final" },
        { ...selectors, entity_type: "entity/UserTable" },
        { ...selectors, data_source: "ingested" },
      ]),
    );

    await publishSelection("Publish these tables");
    expect(getRequestBodies("stateful-tables-publish")).toEqual([
      expect.objectContaining(selectors),
    ]);
    for (const table of BULK_WRITABLE_DB.tables ?? []) {
      await expectRowOwner(table.id, "Bobby Tables");
      await expectRowPublished(table.id);
    }

    // a table of another database is left as it was
    await userEvent.click(await findTreeItem("database", BULK_SAMPLE_DB.name));
    const accountsRow = await findTableRow(BULK_ACCOUNTS_TABLE.id);
    expect(
      within(accountsRow).queryByTestId("table-owner"),
    ).not.toBeInTheDocument();
    expect(
      within(accountsRow).queryByLabelText("Published"),
    ).not.toBeInTheDocument();
  });

  it("should edit the attributes of every table of two schemas", async () => {
    const databases = [BULK_SAMPLE_DB, SCHEMAS_DB];
    const backend = setupTablesBackend({ databases });
    setup({ databases, users: USERS });

    await userEvent.click(await findTreeItem("database", SCHEMAS_DB.name));
    await toggleRowCheckbox(await findTreeItem("schema", "Schema A"));
    await toggleRowCheckbox(await findTreeItem("schema", "Schema B"));
    expect(
      await screen.findByRole("heading", { name: /Multiple tables selected/ }),
    ).toBeInTheDocument();

    await selectAttribute("Pick someone, or type an email", "Bobby Tables");
    await selectAttribute("Select visibility layer", "Final");
    await selectAttribute("Select entity type", "Person");
    await selectAttribute("Select a data source", "Ingested");

    const selectors = {
      ...NO_SELECTORS,
      schema_ids: [`${SCHEMAS_DB_ID}:Schema A`, `${SCHEMAS_DB_ID}:Schema B`],
    };
    await waitFor(() =>
      expect(getRequestBodies("stateful-tables-edit")).toEqual([
        { ...selectors, owner_email: null, owner_user_id: BOBBY_USER.id },
        { ...selectors, data_layer: "final" },
        { ...selectors, entity_type: "entity/UserTable" },
        { ...selectors, data_source: "ingested" },
      ]),
    );

    await userEvent.click(await findTreeItem("schema", "Schema A"));
    await userEvent.click(await findTreeItem("schema", "Schema B"));
    await expectRowOwner(SCHEMA_A_TABLE.id, "Bobby Tables");
    await expectRowOwner(SCHEMA_B_TABLE.id, "Bobby Tables");
    expect(queryTreeItems("table")).toHaveLength(2);
    expect(backend.getTable(SCHEMA_C_TABLE.id).owner_user_id).toBeNull();
  });
});

const TRANSFORMS_DB_ID = 14;
const TRANSFORM = createMockTransform({
  id: 77,
  name: "Test transform for animals",
});
const TRANSFORM_TABLE = createMockTable({
  id: 701,
  db_id: TRANSFORMS_DB_ID,
  schema: "Schema A",
  name: "transform_table",
  display_name: "Transform Table",
  data_source: "metabase-transform",
  transform: TRANSFORM,
});
const ORPHAN_TRANSFORM_TABLE = createMockTable({
  id: 702,
  db_id: TRANSFORMS_DB_ID,
  schema: "Schema A",
  name: "orphan_transform_table",
  display_name: "Orphan Transform Table",
  data_source: "metabase-transform",
  transform: null,
});
const INGESTED_TABLE = createMockTable({
  id: 703,
  db_id: TRANSFORMS_DB_ID,
  schema: "Schema A",
  name: "Animals",
  display_name: "Animals",
  data_source: "ingested",
});
const TRANSFORMS_DB = createMockDatabase({
  id: TRANSFORMS_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [TRANSFORM_TABLE, ORPHAN_TRANSFORM_TABLE, INGESTED_TABLE],
});

const REMOTE_SYNC_DB_ID = 15;
const REMOTE_SYNC_ORDERS_TABLE = createMockTable({
  id: 801,
  db_id: REMOTE_SYNC_DB_ID,
  schema: "",
  name: "ORDERS",
  display_name: "Orders",
  owner_user_id: null,
  owner_email: null,
});
const REMOTE_SYNC_PRODUCTS_TABLE = createMockTable({
  id: 802,
  db_id: REMOTE_SYNC_DB_ID,
  schema: "",
  name: "PRODUCTS",
  display_name: "Products",
});
const REMOTE_SYNC_DB = createMockDatabase({
  id: REMOTE_SYNC_DB_ID,
  name: "QA MySQL8",
  engine: "mysql",
  tables: [REMOTE_SYNC_ORDERS_TABLE, REMOTE_SYNC_PRODUCTS_TABLE],
});

describe("DataModel (data studio, enterprise) > single table editing", () => {
  beforeEach(() => {
    jest
      .spyOn(window.Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const isRow = this.hasAttribute("data-index");
        return createMockDOMRect({ height: isRow ? 44 : 1000, width: 1000 });
      });
  });

  afterEach(async () => {
    await waitForRequestsToSettle();
    jest.restoreAllMocks();
  });

  it("should link a transform-created table to its transform and not let its source be changed", async () => {
    const databases = [SAMPLE_DB, TRANSFORMS_DB];
    setupTablesBackend({ databases });
    setup({ databases });

    await userEvent.click(await findTreeItem("database", TRANSFORMS_DB.name));
    await userEvent.click(await findTableRow(TRANSFORM_TABLE.id));
    expect(await findTableNameInput("Transform Table")).toBeInTheDocument();
    expect(
      within(getTableSection()).getByRole("link", {
        name: /Test transform for animals/,
      }),
    ).toHaveAttribute("href", "/data-studio/transforms/77");
    expect(
      within(getTableSection()).getByPlaceholderText("Select a data source"),
    ).toBeDisabled();

    await userEvent.click(await findTableRow(ORPHAN_TRANSFORM_TABLE.id));
    expect(
      await findTableNameInput("Orphan Transform Table"),
    ).toBeInTheDocument();
    expect(
      within(getTableSection()).getByText("Transform does not exist anymore"),
    ).toBeInTheDocument();
    expect(
      within(getTableSection()).getByPlaceholderText("Select a data source"),
    ).toBeDisabled();

    // positive control: the source of an ingested table can be changed
    await userEvent.click(await findTableRow(INGESTED_TABLE.id));
    expect(await findTableNameInput("Animals")).toBeInTheDocument();
    expect(
      within(getTableSection()).getByPlaceholderText("Select a data source"),
    ).toBeEnabled();
    expect(
      within(getTableSection()).queryByRole("link", {
        name: /Test transform for animals/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(getTableSection()).queryByText("Transform does not exist anymore"),
    ).not.toBeInTheDocument();
  });

  it("should update the tree after publishing, unpublishing, renaming and changing the owner of a table with remote sync enabled (metabase#69554)", async () => {
    const databases = [SAMPLE_DB, REMOTE_SYNC_DB];
    const backend = setupTablesBackend({ databases, hasLibrary: false });
    setupRemoteSyncEndpoints();
    setup({ databases, users: USERS, remoteSyncType: "read-write" });

    await userEvent.click(await findTreeItem("database", REMOTE_SYNC_DB.name));
    await userEvent.click(await findTableRow(REMOTE_SYNC_ORDERS_TABLE.id));
    expect(await findTableNameInput("Orders")).toBeInTheDocument();
    expect(
      within(getTableRow(REMOTE_SYNC_ORDERS_TABLE.id)).queryByTestId(
        "table-published",
      ),
    ).not.toBeInTheDocument();

    // publish
    await userEvent.click(
      within(getTableSection()).getByRole("button", { name: /Publish$/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Create my semantic layer" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Publish this table" }),
    );
    await waitFor(() =>
      expect(
        within(getTableRow(REMOTE_SYNC_ORDERS_TABLE.id)).getByTestId(
          "table-published",
        ),
      ).toBeInTheDocument(),
    );
    expect(getRequestBodies("stateful-tables-publish")).toEqual([
      expect.objectContaining({ table_ids: [REMOTE_SYNC_ORDERS_TABLE.id] }),
    ]);
    expect(
      within(getTableRow(REMOTE_SYNC_PRODUCTS_TABLE.id)).queryByTestId(
        "table-published",
      ),
    ).not.toBeInTheDocument();

    // unpublish
    await userEvent.click(
      await within(getTableSection()).findByRole("button", {
        name: /Unpublish$/,
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Unpublish this table" }),
    );
    await waitFor(() =>
      expect(
        within(getTableRow(REMOTE_SYNC_ORDERS_TABLE.id)).queryByTestId(
          "table-published",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(getRequestBodies("stateful-tables-unpublish")).toEqual([
      expect.objectContaining({ table_ids: [REMOTE_SYNC_ORDERS_TABLE.id] }),
    ]);
    expect(backend.getTable(REMOTE_SYNC_ORDERS_TABLE.id).is_published).toBe(
      false,
    );

    // rename
    const nameInput = await findTableNameInput("Orders");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Orders");
    await userEvent.tab();
    await waitFor(() =>
      expect(getTableRow(REMOTE_SYNC_ORDERS_TABLE.id)).toHaveTextContent(
        "Renamed Orders",
      ),
    );
    expect(
      getRequestBodies(`stateful-table-${REMOTE_SYNC_ORDERS_TABLE.id}-put`),
    ).toEqual([{ display_name: "Renamed Orders" }]);

    // owner
    expect(getTableRow(REMOTE_SYNC_ORDERS_TABLE.id)).not.toHaveTextContent(
      "Bobby Tables",
    );
    await selectOption(
      within(getTableSection()).getByPlaceholderText(
        "Pick someone, or type an email",
      ),
      "Bobby Tables",
    );
    expect(await findToastByMessage("Table owner updated")).toBeInTheDocument();
    expect(
      getRequestBodies(`stateful-table-${REMOTE_SYNC_ORDERS_TABLE.id}-put`),
    ).toEqual([
      { display_name: "Renamed Orders" },
      { owner_email: null, owner_user_id: BOBBY_USER.id },
    ]);
    await waitFor(() =>
      expect(
        within(getTableSection()).getByPlaceholderText(
          "Pick someone, or type an email",
        ),
      ).toHaveValue("Bobby Tables"),
    );
    await expectRowOwner(REMOTE_SYNC_ORDERS_TABLE.id, "Bobby Tables");
  });
});

function setupRemoteSyncEndpoints() {
  fetchMock.get("path:/api/ee/remote-sync/current-task", 204);
  fetchMock.get("path:/api/ee/remote-sync/is-dirty", { is_dirty: false });
  fetchMock.get("path:/api/ee/remote-sync/dirty", { dirty: [] });
  fetchMock.get("path:/api/ee/remote-sync/has-remote-changes", {
    has_changes: false,
  });
}
