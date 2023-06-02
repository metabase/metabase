import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { within } from "@testing-library/react";
import { Database } from "metabase-types/api";
import {
  createOrdersDiscountField,
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { getMetadataRoutes } from "../../routes";

const ORDERS_ID_FIELD = createOrdersIdField();

const ORDERS_PRODUCT_ID_FIELD = createOrdersProductIdField();

const ORDERS_DISCOUNT_FIELD = createOrdersDiscountField();

const ORDERS_TABLE = createOrdersTable({
  fields: [ORDERS_ID_FIELD, ORDERS_PRODUCT_ID_FIELD, ORDERS_DISCOUNT_FIELD],
  visibility_type: "technical",
});

const PRODUCTS_TABLE = createProductsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const PEOPLE_TABLE_MULTI_SCHEMA = createPeopleTable({
  db_id: 2,
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

const ORDERS_TABLE_NO_SCHEMA = createOrdersTable({
  id: 10,
  db_id: 3,
  schema: "",
});

const SAMPLE_DB_NO_SCHEMA = createSampleDatabase({
  id: 3,
  name: "No schema",
  tables: [ORDERS_TABLE_NO_SCHEMA],
});

interface SetupOpts {
  databases?: Database[];
}

const setup = async ({ databases = [SAMPLE_DB] }: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);

  renderWithProviders(
    <Route path="admin/datamodel">{getMetadataRoutes()}</Route>,
    { withRouter: true, initialRoute: "admin/datamodel" },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("MetadataEditor", () => {
  describe("no schema database", () => {
    it("should select the first database and skip schema selection by default", async () => {
      await setup({ databases: [SAMPLE_DB_NO_SCHEMA] });

      expect(screen.getByText(SAMPLE_DB_NO_SCHEMA.name)).toBeInTheDocument();
      expect(
        screen.getByText(ORDERS_TABLE_NO_SCHEMA.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Find a schema"),
      ).not.toBeInTheDocument();
    });
  });

  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      await setup();

      expect(screen.getByText(SAMPLE_DB.name)).toBeInTheDocument();
      expect(screen.getByText(ORDERS_TABLE.display_name)).toBeInTheDocument();
      expect(screen.queryByText(ORDERS_TABLE.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup();

      const searchValue = ORDERS_TABLE.name.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a table"), searchValue);

      expect(screen.getByText(ORDERS_TABLE.display_name)).toBeInTheDocument();
      expect(
        screen.queryByText(PRODUCTS_TABLE.display_name),
      ).not.toBeInTheDocument();
    });

    it("should not allow to enter an empty table name", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.clear(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      );
      userEvent.tab();

      expect(
        screen.getByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should not allow to enter an empty field name", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.clear(
        await screen.findByDisplayValue(ORDERS_ID_FIELD.display_name),
      );
      userEvent.tab();

      expect(
        screen.getByDisplayValue(ORDERS_ID_FIELD.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to switch between metadata and original schema", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue(ORDERS_ID_FIELD.display_name),
      ).toBeInTheDocument();

      userEvent.click(screen.getByRole("radio", { name: "Original schema" }));
      expect(screen.getByText(ORDERS_TABLE.name)).toBeInTheDocument();
      expect(screen.getByText(ORDERS_ID_FIELD.name)).toBeInTheDocument();
    });

    it("should display visible tables", async () => {
      await setup();
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();
      expect(screen.getByText("1 Hidden Table")).toBeInTheDocument();

      userEvent.click(screen.getByText(PRODUCTS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(PRODUCTS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Queryable" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Hidden" }),
      ).not.toBeChecked();
      expect(
        screen.queryByRole("checkbox", { name: "Technical Data" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: "Irrelevant/Cruft" }),
      ).not.toBeInTheDocument();
    });

    it("should display hidden tables", async () => {
      await setup();
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();
      expect(screen.getByText("1 Hidden Table")).toBeInTheDocument();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "Queryable" }),
      ).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Hidden" })).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Technical Data" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Irrelevant/Cruft" }),
      ).not.toBeChecked();
    });

    it("should display sort options", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(await screen.findByLabelText("Sort"));

      expect(await screen.findByText("Database")).toBeInTheDocument();
      expect(screen.getByText("Alphabetical")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
      expect(screen.getByText("Smart")).toBeInTheDocument();
    });

    it("should display field visibility options", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      const section = within(
        await screen.findByLabelText(ORDERS_ID_FIELD.name),
      );
      userEvent.click(section.getByText("Everywhere"));

      expect(
        await screen.findByText("Only in detail views"),
      ).toBeInTheDocument();
      expect(screen.getByText("Do not include")).toBeInTheDocument();
    });

    it("should allow to search for field semantic types", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      const section = within(
        await screen.findByLabelText(ORDERS_ID_FIELD.name),
      );
      userEvent.click(section.getByText("Entity Key"));
      expect(await screen.findByText("Entity Name")).toBeInTheDocument();

      userEvent.type(screen.getByPlaceholderText("Find..."), "Pri");
      expect(screen.getByText("Price")).toBeInTheDocument();
      expect(screen.queryByText("Score")).not.toBeInTheDocument();
    });

    it("should show the foreign key target for foreign keys", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      const section = within(
        await screen.findByLabelText(ORDERS_PRODUCT_ID_FIELD.name),
      );
      userEvent.click(section.getByText("Products → ID"));

      const popover = within(await screen.findByTestId("popover"));
      expect(popover.getByText("Products → ID")).toBeInTheDocument();
      expect(popover.queryByText("Orders → ID")).not.toBeInTheDocument();

      userEvent.type(popover.getByPlaceholderText("Find..."), "Products");
      expect(popover.getByText("Products → ID")).toBeInTheDocument();
    });

    it("should not show the foreign key target for non-foreign keys", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      const section = within(
        await screen.findByLabelText(ORDERS_ID_FIELD.name),
      );

      expect(section.queryByText("Products → ID")).not.toBeInTheDocument();
    });

    it("should show currency settings for currency fields", async () => {
      await setup();
      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));

      const section = within(
        await screen.findByLabelText(ORDERS_DISCOUNT_FIELD.name),
      );
      userEvent.click(section.getByText("US Dollar"));

      const popover = within(await screen.findByTestId("popover"));
      expect(popover.getByText("Canadian Dollar")).toBeInTheDocument();
      expect(popover.getByText("Euro")).toBeInTheDocument();

      userEvent.type(popover.getByPlaceholderText("Find..."), "Dollar");
      expect(popover.getByText("US Dollar")).toBeInTheDocument();
      expect(popover.getByText("Canadian Dollar")).toBeInTheDocument();
      expect(popover.queryByText("Euro")).not.toBeInTheDocument();
    });

    it("should not show currency settings for non-currency fields", async () => {
      await setup();
      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));

      const section = within(
        await screen.findByLabelText(ORDERS_ID_FIELD.name),
      );
      expect(section.queryByText("US Dollar")).not.toBeInTheDocument();
    });
  });

  describe("multi schema database", () => {
    it("should not select the first schema if there are multiple schemas", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      expect(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name)).toBeInTheDocument();
      expect(
        screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        screen.getByText(REVIEWS_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a schema", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      const searchValue = PEOPLE_TABLE_MULTI_SCHEMA.schema.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a schema"), searchValue);

      expect(
        screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(REVIEWS_TABLE_MULTI_SCHEMA.schema),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      expect(
        await screen.findByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(REVIEWS_TABLE_MULTI_SCHEMA.display_name),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByText("Schemas"));
      expect(
        screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
      expect(
        screen.getByText(REVIEWS_TABLE_MULTI_SCHEMA.schema),
      ).toBeInTheDocument();
    });
  });

  describe("multiple databases", () => {
    it("should be able to switch databases", async () => {
      await setup({ databases: [SAMPLE_DB, SAMPLE_DB_MULTI_SCHEMA] });
      expect(
        await screen.findByText(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB.name));
      userEvent.click(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name));
      userEvent.click(
        await screen.findByText(PEOPLE_TABLE_MULTI_SCHEMA.schema),
      );
      expect(
        await screen.findByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("no databases", () => {
    it("should display an empty state", async () => {
      await setup({ databases: [] });

      expect(
        screen.getByText("The page you asked for couldn't be found."),
      ).toBeInTheDocument();
    });
  });
});
