import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Database, Field, Table } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import {
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createOrdersUserIdField,
  createProductsTable,
  createSampleDatabase,
  ORDERS,
} from "metabase-types/api/mocks/presets";
import {
  setupDatabasesEndpoints,
  setupFieldsValuesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { getMetadataRoutes } from "../../routes";

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
});

const PRODUCTS_TABLE = createProductsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const FIELD_VALUES = [createMockFieldValues({ field_id: ORDERS.ID })];

interface SetupOpts {
  database?: Database;
  table?: Table;
  field?: Field;
}

const setup = async ({
  database = SAMPLE_DB,
  table = ORDERS_TABLE,
  field = ORDERS_ID_FIELD,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupFieldsValuesEndpoints(FIELD_VALUES);

  renderWithProviders(
    <Route path="admin/datamodel">{getMetadataRoutes()}</Route>,
    {
      withRouter: true,
      initialRoute: `/admin/datamodel/database/${database.id}/schema/${table.db_id}:${table.schema}/table/${table.id}/field/${field.id}`,
    },
  );

  await waitUntilLoaded();
};

const fieldLink = (field: Field) => {
  const section = within(screen.getByLabelText(field.name));
  return section.getByLabelText("Field settings");
};

const waitUntilLoaded = async () => {
  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("MetadataFieldSettings", () => {
  describe("single schema database", () => {
    it("should not allow to enter an empty field name", async () => {
      await setup();

      userEvent.clear(screen.getByDisplayValue(ORDERS_ID_FIELD.display_name));
      userEvent.tab();

      expect(
        screen.getByDisplayValue(ORDERS_ID_FIELD.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to navigate to and from field settings", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await waitUntilLoaded();
      expect(screen.getByText(ORDERS_TABLE.display_name)).toBeInTheDocument();

      userEvent.click(fieldLink(ORDERS_ID_FIELD));
      await waitUntilLoaded();
      expect(screen.getByText("General")).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB.name));
      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(fieldLink(ORDERS_ID_FIELD));
      await waitUntilLoaded();
      expect(screen.getByText("General")).toBeInTheDocument();
    });
  });
});
