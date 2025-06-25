import { IndexRedirect, Route } from "react-router";

import {
  setupCardDataset,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import { SAMPLE_DATABASE } from "metabase-lib/test-helpers";
import type { Database } from "metabase-types/api";
import {
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersUserIdField,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataModel } from "./DataModel";
import type { ParsedRouteParams } from "./types";
import { getUrl } from "./utils";

registerVisualizations();

const DEFAULT_ROUTE_PARAMS: ParsedRouteParams = {
  databaseId: undefined,
  schemaName: undefined,
  tableId: undefined,
  fieldId: undefined,
};

const ORDERS_ID_FIELD = createOrdersIdField();

const ORDERS_PRODUCT_ID_FIELD = createOrdersProductIdField();

const ORDERS_USER_ID_FIELD = createOrdersUserIdField();

const ORDERS_DISCOUNT_FIELD = createOrdersDiscountField();

const ORDERS_TABLE = createOrdersTable({
  fields: [
    ORDERS_ID_FIELD,
    ORDERS_PRODUCT_ID_FIELD,
    ORDERS_USER_ID_FIELD,
    ORDERS_DISCOUNT_FIELD,
  ],
  visibility_type: "technical",
});

const PRODUCTS_TABLE = createProductsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const ORDERS_TABLE_NO_SCHEMA = createOrdersTable({
  schema: "",
});

const SAMPLE_DB_NO_SCHEMA = createSampleDatabase({
  name: "No schema",
  tables: [ORDERS_TABLE_NO_SCHEMA],
});

interface SetupOpts {
  databases?: Database[];
  params?: ParsedRouteParams;
}

function setup({
  databases = [SAMPLE_DATABASE],
  params = DEFAULT_ROUTE_PARAMS,
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases, { hasSavedQuestions: false });
  setupCardDataset();

  renderWithProviders(
    <Route path="admin/datamodel">
      <IndexRedirect to="database" />
      <Route path="database" component={DataModel} />
      <Route path="database/:databaseId" component={DataModel} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={DataModel}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
        component={DataModel}
      />
    </Route>,
    {
      withRouter: true,
      initialRoute: getUrl(params),
    },
  );
}

describe("DataModel", () => {
  beforeEach(() => {
    // so the virtual list renders correctly in the tests
    mockGetBoundingClientRect();
  });

  it("should show empty state by default", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText(SAMPLE_DATABASE.name)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Segments/ })).toBeInTheDocument();
    expect(
      screen.getByText("Start by selecting data to model"),
    ).toBeInTheDocument();
  });

  describe("no schema database", () => {
    it("should select the first database and skip schema selection by default", async () => {
      setup({ databases: [SAMPLE_DB_NO_SCHEMA] });

      await waitFor(() => {
        expect(screen.getByText(SAMPLE_DB_NO_SCHEMA.name)).toBeInTheDocument();
      });

      expect(
        screen.getByText(ORDERS_TABLE_NO_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByText(SAMPLE_DB.name)).toBeInTheDocument();
      });

      expect(screen.getByText(ORDERS_TABLE.display_name)).toBeInTheDocument();
      expect(screen.queryByText(ORDERS_TABLE.schema)).not.toBeInTheDocument();
    });
  });
});
