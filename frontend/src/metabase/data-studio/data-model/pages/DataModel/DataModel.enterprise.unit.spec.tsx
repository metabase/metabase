import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
import { Outlet, Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Database, Table, TableId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
  createMockTokenFeatures,
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
}

function setup({
  databases = [SAMPLE_DB],
  initialRoute = BASE_PATH,
  editableTable,
  searchResults,
}: SetupOpts = {}) {
  // Registered first so that they answer before the static table routes.
  const updates = editableTable ? setupEditableTable(editableTable) : [];
  if (searchResults) {
    setupTableSearch(searchResults);
  }

  setupDatabasesEndpoints(databases);
  setupCardDataset();
  setupTablesBulkEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
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
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
        dependencies: true,
        library: true,
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

      await userEvent.click(getTableTreeItem(MYSQL_REVIEWS_TABLE.id));
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
        await within(getTableSection()).findByText("This table has no fields"),
      ).toBeInTheDocument();
      expect(
        within(getTableSection()).queryByRole("button", { name: /Sorting/ }),
      ).not.toBeInTheDocument();

      // positive control: a table with fields can be sorted
      await userEvent.click(await findTreeItem("schema", "Wild"));
      await userEvent.click(getTableTreeItem(WILD_ANIMALS_TABLE.id));
      await userEvent.click(await screen.findByRole("tab", { name: /Fields/ }));
      expect(
        await within(getTableSection()).findByRole("button", {
          name: /Sorting/,
        }),
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
  await userEvent.click(getTableTreeItem(tableId));
  await assert();
}

function getDataModel() {
  return screen.getByTestId("data-model");
}

function queryNotFound() {
  return within(getDataModel()).queryByText(/Not found/);
}

function getTableSection() {
  return screen.getByTestId("table-section");
}

function getFieldSection() {
  return screen.getByTestId("field-section");
}

async function findTableNameInput(value?: string) {
  if (value != null) {
    return await within(
      await screen.findByTestId("table-section"),
    ).findByDisplayValue(value);
  }
  return await within(
    await screen.findByTestId("table-section"),
  ).findByPlaceholderText("Give this table a name");
}

function getTableDescriptionInput() {
  return within(getTableSection()).getByPlaceholderText(
    "Give this table a description",
  );
}

async function clickTableSectionField(name: string) {
  const field = await within(getTableSection()).findByRole("listitem", {
    name,
  });
  await userEvent.click(within(field).getByRole("img"));
}

async function findFieldDataType(value: string) {
  return await waitFor(() => {
    const dataType = within(getFieldSection()).getByLabelText("Data type");
    expect(dataType).toHaveTextContent(value);
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
    .filter((item) => item.getAttribute("data-type") === type);
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

function getTableTreeItem(tableId: TableId) {
  const item = queryTreeItems("table").find(
    (item) => item.getAttribute("data-table-id") === String(tableId),
  );
  return checkNotNull(item);
}
