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
  createPeopleIdField,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  ORDERS,
  PEOPLE,
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

const PEOPLE_ID_FIELD = createPeopleIdField();

const PEOPLE_TABLE_MULTI_SCHEMA = createPeopleTable({
  db_id: 2,
  fields: [PEOPLE_ID_FIELD],
});

const REVIEWS_TABLE_MULTI_SCHEMA = createReviewsTable({
  db_id: 2,
  schema: "PRIVATE",
});

const SAMPLE_DB_MULTI_SCHEMA = createSampleDatabase({
  id: 2,
  name: "Multi schema",
  tables: [PEOPLE_TABLE_MULTI_SCHEMA, REVIEWS_TABLE_MULTI_SCHEMA],
});

const FIELD_VALUES = [
  createMockFieldValues({ field_id: ORDERS.ID }),
  createMockFieldValues({ field_id: PEOPLE.ID }),
];

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
      expect(screen.queryByText(ORDERS_TABLE.schema)).not.toBeInTheDocument();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await waitUntilLoaded();
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

  describe("multi schema database", () => {
    it("should allow to navigate to and from field settings", async () => {
      await setup({
        database: SAMPLE_DB_MULTI_SCHEMA,
        table: PEOPLE_TABLE_MULTI_SCHEMA,
        field: PEOPLE_ID_FIELD,
      });

      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name));
      await waitUntilLoaded();
      userEvent.click(fieldLink(PEOPLE_ID_FIELD));
      await waitUntilLoaded();
      expect(screen.getByText("General")).toBeInTheDocument();

      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name));
      userEvent.click(fieldLink(PEOPLE_ID_FIELD));
      await waitUntilLoaded();
      expect(screen.getByText("General")).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name));
      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name));
      userEvent.click(fieldLink(PEOPLE_ID_FIELD));
      await waitUntilLoaded();
      expect(screen.getByText("General")).toBeInTheDocument();
    });
  });
});
