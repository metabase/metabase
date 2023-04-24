import React from "react";
import { IndexRedirect, Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Database } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetadataTableSettings from "../MetadataTableSettings";
import MetadataEditor from "./MetadataEditor";

const TEST_TABLE_1 = createMockTable({
  id: 1,
  name: "ORDERS",
  display_name: "Orders",
  schema: "PUBLIC",
});

const TEST_TABLE_2 = createMockTable({
  id: 2,
  name: "PEOPLE",
  display_name: "People",
  schema: "PUBLIC",
});

const TEST_TABLE_3 = createMockTable({
  id: 3,
  db_id: 2,
  name: "REVIEWS",
  display_name: "Reviews",
  schema: "PUBLIC",
});

const TEST_TABLE_4 = createMockTable({
  id: 4,
  db_id: 2,
  name: "INVOICES",
  display_name: "Invoices",
  schema: "PUBLIC",
});

const TEST_TABLE_5 = createMockTable({
  id: 5,
  db_id: 2,
  name: "Accounts",
  display_name: "ACCOUNTS",
  schema: "PRIVATE",
});

const TEST_DB = createMockDatabase({
  id: 1,
  name: "One schema",
  tables: [TEST_TABLE_1, TEST_TABLE_2],
});

const TEST_MULTI_SCHEMA_DB = createMockDatabase({
  id: 2,
  name: "Multi schema",
  tables: [TEST_TABLE_3, TEST_TABLE_4, TEST_TABLE_5],
});

interface SetupOpts {
  databases?: Database[];
}

const setup = async ({ databases = [TEST_DB] }: SetupOpts = {}) => {
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
    { withRouter: true, initialRoute: "admin/datamodel" },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("MetadataEditor", () => {
  describe("single schema database", () => {
    it("should select the first database and the only schema by default", async () => {
      await setup();

      expect(screen.getByText(TEST_DB.name)).toBeInTheDocument();
      expect(screen.getByText(TEST_TABLE_1.display_name)).toBeInTheDocument();
      expect(screen.queryByText(TEST_TABLE_1.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup();

      const searchValue = TEST_TABLE_1.name.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a table"), searchValue);

      expect(screen.getByText(TEST_TABLE_1.display_name)).toBeInTheDocument();
      expect(
        screen.queryByText(TEST_TABLE_2.display_name),
      ).not.toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup();

      userEvent.click(screen.getByText(TEST_TABLE_1.display_name));
      userEvent.click(getIcon("gear"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_DB.name));
      expect(await screen.findByText("2 Queryable Tables")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_TABLE_1.display_name));
      userEvent.click(getIcon("gear"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_TABLE_1.display_name));
      expect(
        await screen.findByDisplayValue(TEST_TABLE_1.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("multi schema database", () => {
    it("should not select the first schema if there are multiple schemas", async () => {
      await setup({ databases: [TEST_MULTI_SCHEMA_DB] });

      expect(screen.getByText(TEST_MULTI_SCHEMA_DB.name)).toBeInTheDocument();
      expect(screen.getByText(TEST_TABLE_4.schema)).toBeInTheDocument();
      expect(screen.getByText(TEST_TABLE_5.schema)).toBeInTheDocument();
      expect(
        screen.queryByText(TEST_TABLE_4.display_name),
      ).not.toBeInTheDocument();
    });

    it("should allow to search for a schema", async () => {
      await setup({ databases: [TEST_MULTI_SCHEMA_DB] });

      const searchValue = TEST_TABLE_4.schema.substring(0, 3);
      userEvent.type(screen.getByPlaceholderText("Find a schema"), searchValue);

      expect(screen.getByText(TEST_TABLE_4.schema)).toBeInTheDocument();
      expect(screen.queryByText(TEST_TABLE_5.schema)).not.toBeInTheDocument();
    });

    it("should allow to search for a table", async () => {
      await setup({ databases: [TEST_MULTI_SCHEMA_DB] });

      userEvent.click(screen.getByText(TEST_TABLE_4.schema));
      expect(
        await screen.findByText(TEST_TABLE_4.display_name),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(TEST_TABLE_5.display_name),
      ).not.toBeInTheDocument();

      userEvent.click(screen.getByText("Schemas"));
      expect(screen.getByText(TEST_TABLE_4.schema)).toBeInTheDocument();
      expect(screen.getByText(TEST_TABLE_5.schema)).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings", async () => {
      await setup({ databases: [TEST_MULTI_SCHEMA_DB] });

      userEvent.click(screen.getByText(TEST_TABLE_3.schema));
      userEvent.click(await screen.findByText(TEST_TABLE_3.display_name));
      userEvent.click(getIcon("gear"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_MULTI_SCHEMA_DB.name));
      expect(await screen.findByText("2 schemas")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_TABLE_3.schema));
      userEvent.click(screen.getByText(TEST_TABLE_3.display_name));
      userEvent.click(getIcon("gear"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_TABLE_3.schema));
      expect(await screen.findByText("2 Queryable Tables")).toBeInTheDocument();

      userEvent.click(await screen.findByText(TEST_TABLE_3.display_name));
      userEvent.click(getIcon("gear"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      userEvent.click(screen.getByText(TEST_TABLE_3.display_name));
      expect(
        await screen.findByDisplayValue(TEST_TABLE_3.display_name),
      ).toBeInTheDocument();
    });
  });
});
