import React from "react";
import { IndexRedirect, Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { within } from "@testing-library/react";
import { Database } from "metabase-types/api";
import {
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
  waitFor,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetadataTableSettings from "../MetadataTableSettings";
import MetadataEditor from "./MetadataEditor";

const ORDERS_TABLE = createOrdersTable({
  visibility_type: "technical",
});

const PRODUCTS_TABLE = createProductsTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE, PRODUCTS_TABLE],
});

const PEOPLE_TABLE = createPeopleTable({
  db_id: 2,
});

const REVIEWS_TABLE = createReviewsTable({
  db_id: 2,
  schema: "PRIVATE",
});

const SAMPLE_DB_MULTI_SCHEMA = createSampleDatabase({
  id: 2,
  name: "Multi schema",
  tables: [PEOPLE_TABLE, REVIEWS_TABLE],
});

interface SetupOpts {
  databases?: Database[];
  initialRoute?: string;
}

const setup = async ({
  databases = [SAMPLE_DB],
  initialRoute = "admin/datamodel",
}: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);

  renderWithProviders(
    <Route path="admin/datamodel">
      <IndexRedirect to="database" />
      <Route path="database" component={MetadataEditor} />
      <Route path="database/:databaseId" component={MetadataEditor} />
      <Route
        path="database/:databaseId/schema/:schemaId"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId"
        component={MetadataEditor}
      />
      <Route
        path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
        component={MetadataTableSettings}
      />
    </Route>,
    { withRouter: true, initialRoute },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("MetadataEditor", () => {
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
      const [field] = ORDERS_TABLE.fields ?? [];
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.clear(await screen.findByDisplayValue(field.display_name));
      userEvent.tab();

      expect(screen.getByDisplayValue(field.display_name)).toBeInTheDocument();
    });

    it("should allow to switch between metadata and original schema", async () => {
      const [field] = ORDERS_TABLE.fields ?? [];
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue(field.display_name)).toBeInTheDocument();

      userEvent.click(screen.getByRole("radio", { name: "Original schema" }));
      expect(screen.getByText(ORDERS_TABLE.name)).toBeInTheDocument();
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
      const [field] = ORDERS_TABLE.fields ?? [];
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(await screen.findByLabelText(field.name));
      userEvent.click(
        within(screen.getByLabelText(field.name)).getByText("Everywhere"),
      );

      expect(
        await screen.findByText("Only in detail views"),
      ).toBeInTheDocument();
      expect(screen.getByText("Do not include")).toBeInTheDocument();
    });

    it("should allow to search for field semantic types", async () => {
      const [field] = ORDERS_TABLE.fields ?? [];
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(await screen.findByLabelText(field.name));
      userEvent.click(
        within(screen.getByLabelText(field.name)).getByText("Entity Key"),
      );
      expect(await screen.findByText("Entity Name")).toBeInTheDocument();

      userEvent.type(screen.getByPlaceholderText("Find..."), "Pri");
      expect(screen.getByText("Price")).toBeInTheDocument();
      expect(screen.queryByText("Score")).not.toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB.name));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();
      expect(screen.getByText("1 Hidden Table")).toBeInTheDocument();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to rescan field values", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      userEvent.click(
        await screen.findByRole("button", { name: "Re-scan this table" }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/rescan_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });

    it("should allow to discard field values", async () => {
      await setup();

      userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      userEvent.click(
        await screen.findByRole("button", {
          name: "Discard cached field values",
        }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/discard_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });
  });

  describe("multi schema database", () => {
    it("should not select the first schema if there are multiple schemas", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      expect(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name)).toBeInTheDocument();
      expect(screen.getByText(PEOPLE_TABLE.schema)).toBeInTheDocument();
      expect(screen.getByText(REVIEWS_TABLE.schema)).toBeInTheDocument();
      expect(
        screen.queryByText(PEOPLE_TABLE.display_name),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a schema", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      const searchValue = PEOPLE_TABLE.schema.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a schema"), searchValue);

      expect(screen.getByText(PEOPLE_TABLE.schema)).toBeInTheDocument();
      expect(screen.queryByText(REVIEWS_TABLE.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      userEvent.click(screen.getByText(PEOPLE_TABLE.schema));
      expect(
        await screen.findByText(PEOPLE_TABLE.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(REVIEWS_TABLE.display_name),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByText("Schemas"));
      expect(screen.getByText(PEOPLE_TABLE.schema)).toBeInTheDocument();
      expect(screen.getByText(REVIEWS_TABLE.schema)).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      userEvent.click(screen.getByText(PEOPLE_TABLE.schema));
      userEvent.click(await screen.findByText(PEOPLE_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name));
      expect(await screen.findByText("2 schemas")).toBeInTheDocument();

      userEvent.click(screen.getByText(PEOPLE_TABLE.schema));
      userEvent.click(screen.getByText(PEOPLE_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(PEOPLE_TABLE.schema));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();

      userEvent.click(await screen.findByText(PEOPLE_TABLE.display_name));
      userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(PEOPLE_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(PEOPLE_TABLE.display_name),
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
      userEvent.click(await screen.findByText(PEOPLE_TABLE.schema));
      expect(
        await screen.findByText(PEOPLE_TABLE.display_name),
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
